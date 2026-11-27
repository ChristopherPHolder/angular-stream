Fastly Compute runs JavaScript in StarlingMonkey, a SpiderMonkey build compiled
to WebAssembly, not in V8 or Node. Angular's server renderer runs there as it
is: the server bundle is compiled into a Wasm module, the built files go to a
KV Store through Fastly's
[static publisher](https://github.com/fastly/compute-js-static-publish), and
every path without a file is rendered and streamed. This is the setup of
[`apps/example-fastly`](../../../../../apps/example-fastly/src/server.ts).

> [!NOTE]
> The example is checked in Viceroy, Fastly's local server
> (`fastly compute serve`): the shell arrives at once, the widget's chunk 2 s
> later, and the page hydrates. It has not been checked against a real Fastly
> deployment yet.

## 1. Install

```bash
pnpm add @push-based/angular-stream-core@next @fastly/compute-js-static-publish
pnpm add -D @fastly/js-compute
```

`@fastly/js-compute` compiles the server bundle to Wasm (`js-compute-runtime`)
and has the types of the `fastly:*` modules. The static publisher is bundled
into the server, and its CLI uploads the built files. Running the app locally
and deploying it also need the
[Fastly CLI](https://www.fastly.com/documentation/reference/tools/cli/); building
it doesn't.

## 2. The browser config

Add the interceptor and the stream's providers next to Angular's hydration:

```ts title="src/app/app.config.ts"
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideClientHydration(withEventReplay()),
    // After `provideClientHydration()`: it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

## 3. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 4. The server entry

There is no adapter package for Compute: the entry calls the core's
`createStreamingHandler()` and supplies the template itself.

```ts title="src/server.ts"
/// <reference types="@fastly/js-compute" />
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { PublisherServer } from '@fastly/compute-js-static-publish';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import rc from '../static-publish.rc.js';
import { App } from './app/app';
import { config } from './app/app.config.server';

// Compute's engine has no `URL.canParse()`, and Angular's server renderer calls it.
if (typeof URL.canParse !== 'function') {
  URL.canParse = (url: string | URL, base?: string | URL) => {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}

/** The files of `dist/client`, from the KV Store the static publisher fills. */
const publisher = PublisherServer.fromStaticPublishRc(rc);

const render = createStreamingHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', '127.0.0.1', 'my-app.edgecompute.app'],
  // `index.html` is published as a hidden file: the template, never served as is.
  loadTemplate: async () => {
    const asset = await publisher.getMatchingAsset('/index.html', { includeHidden: true });
    const file = asset && (await publisher.loadAssetVariant(asset, null));
    return file ? new Response(file.storageEntry.body) : new Response(null, { status: 404 });
  },
});

/**
 * The page, kept running for one task after its body ends. The renderer tears
 * Angular down a task after the last chunk, and Compute stops the instance as
 * soon as the body is done, with an error while a timer is still pending.
 */
async function renderPage(event: FetchEvent): Promise<Response> {
  const response = await render(event.request);
  if (response.body === null) {
    return response;
  }

  let ended!: () => void;
  event.waitUntil(
    new Promise<void>((resolve) => (ended = resolve)).then(
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    ),
  );

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          ended();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        ended();
      }
    },
    cancel(reason) {
      ended();
      return reader.cancel(reason);
    },
  });

  return new Response(body, response);
}

/** Compute entry: a published file if one matches, otherwise the streamed page. */
addEventListener('fetch', (event) =>
  event.respondWith(
    publisher
      .serveRequest(event.request, { fallback: false })
      .then((file) => file ?? renderPage(event)),
  ),
);
```

Three things here are for Compute:

- **`URL.canParse()`**: `@angular/platform-server` calls it to resolve the
  request URL, and StarlingMonkey doesn't have it. Without it, every page
  request fails.
- **`renderPage()`**: the renderer destroys Angular's platform in a
  `setTimeout(0)` after it closes the body. Compute ends the instance when the
  response is done, and an instance that ends with a timer still pending exits
  with status 1, reported as an error on every request. The response itself is
  complete either way. `event.waitUntil()` keeps the instance for
  that one more task.
- **The template**: `fallback: false` makes `serveRequest()` return `null` for
  every path without a file, so those go to the renderer. `index.html` is
  published as a hidden file (step 6), so `serveRequest()` never sends it, and
  `loadTemplate` reads it with `includeHidden`.

`allowedHosts` must list every hostname the service answers for, the
`*.edgecompute.app` one included: Angular's SSR host guard rejects any other
`host` header, and the page answers `403`.

`eventDispatchContract` is for `withEventReplay()`: the built `index.html`
doesn't carry the script Angular needs to queue the clicks made before the page
hydrates, so the handler adds it.

Don't open a KV Store, or anything else from `fastly:*`, at the top level of the
module. `js-compute-runtime` runs the module once at build time to snapshot it,
and Compute APIs throw there. `PublisherServer.fromStaticPublishRc()` only opens
its store when a request comes in.

## 5. Vite

```ts title="vite.config.ts"
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  // `vite build` builds both: the browser app, then the server bundle.
  builder: {},
  // Compute's engine is closer to a web worker than to Node: resolve the
  // server's dependencies to their browser builds, all bundled into one file.
  ssr: { target: 'webworker', noExternal: true },
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      build: {
        outDir: 'dist/server',
        ssr: 'src/server.ts',
        copyPublicDir: false,
        rollupOptions: {
          // The Compute APIs, provided by `js-compute-runtime` when it compiles the bundle.
          external: [/^fastly:/],
          output: { codeSplitting: false },
        },
      },
    },
  },
  plugins: [ngp({ entries: ['src/main.ts', 'src/server.ts'] })],
});
```

`vite build` writes the browser app to `dist/client` and the whole server, one
ES module with nothing but `fastly:*` imports left, to `dist/server/server.js`.
`target: 'webworker'` matters: with Node's resolution, the static publisher's
dependencies import Node's `buffer` and the bundle doesn't compile.

The server imports `static-publish.rc.js`, so the app's `tsconfig.app.json`
needs `"allowJs": true` (and `"noEmit": true`) with that file in `include`.

## 6. The static publisher

Two files next to `package.json`. The first names the KV Store, and is compiled
into the server:

```js title="static-publish.rc.js"
/** @type {import('@fastly/compute-js-static-publish').StaticPublishRc} */
const rc = {
  storageMode: 'kv-store',
  kvStore: { kvStoreName: 'example-content' },
  publishId: 'default',
  defaultCollectionName: 'live',
  staticPublisherWorkingDir: './static-publisher',
};

export default rc;
```

The second says what to publish, and how the files are served:

```js title="publish-content.config.js"
/** @type {import('@fastly/compute-js-static-publish').PublishContentConfig} */
const config = {
  rootDir: './dist/client',
  // The template the server renders into: stored, but never served as a file.
  hiddenItems: ['/index.html'],
  server: {
    // Hashed by Vite, so cached for a long time.
    staticItems: ['/assets/'],
    allowedEncodings: ['br', 'gzip'],
    // Every path without a file goes on to the renderer.
    spaFile: false,
    notFoundPageFile: false,
    autoExt: [],
    autoIndex: [],
  },
};

export default config;
```

Hidden files need the static publisher 8.1 or later.

## 7. `fastly.toml`

```toml title="fastly.toml"
language = "javascript"
manifest_version = 3
name = "angular-stream-example"

[scripts]
build = "pnpm run build && pnpm run compile"

[local_server.kv_stores]
example-content = { file = "./static-publisher/kvstore.json", format = "json" }

[setup.kv_stores.example-content]
```

`[local_server.kv_stores]` is the store Viceroy simulates, from the file the
static publisher writes locally. `[setup.kv_stores]` creates the real one on the
first deploy. Add `bin/`, `pkg/` and `static-publisher/` to `.gitignore`.

## 8. Build and run it locally

The scripts in `package.json`:

```json title="package.json"
{
  "scripts": {
    "build": "vp build",
    "compile": "js-compute-runtime dist/server/server.js bin/main.wasm",
    "content:local": "compute-js-static-publish publish-content --local",
    "start": "fastly compute serve --skip-build"
  }
}
```

```bash
pnpm build          # dist/client and dist/server/server.js
pnpm compile        # bin/main.wasm
pnpm content:local  # dist/client into Viceroy's KV Store
pnpm start          # http://127.0.0.1:7676
```

The browser app uses `vp`, Vite+'s CLI; `vite build` does the same. `compile`
takes about 7 seconds. Publish the content again after each build, because the
file names change, and restart Viceroy after a publish. There is no dev server
that runs the server side: `vite dev` alone serves the app without SSR.

## 9. Deploy

With the Fastly CLI logged in:

```bash
fastly compute publish
FASTLY_API_TOKEN=<token> pnpm exec compute-js-static-publish publish-content
```

`fastly compute publish` runs the `build` script from `fastly.toml`, packages
`bin/main.wasm` and deploys it; the first time, it creates the service and the
KV Store. `publish-content` then uploads `dist/client` to the store. It reads
the token only from `FASTLY_API_TOKEN` or `--fastly-api-token`, not from the
CLI's profile. After a new build, run both again, the content first: the new
server expects the new file names.

## Limits

What the example used in Viceroy, against
[Compute's limits](https://docs.fastly.com/products/compute-resource-limits):

|                       | The example                                         | Compute's limit                     |
| --------------------- | --------------------------------------------------- | ----------------------------------- |
| Package               | 52 MB Wasm, 15 MB compressed                        | 100 MB                              |
| Heap per request      | 25 MiB                                              | 128 MB                              |
| CPU per request       | about 15 ms, measured with Viceroy's guest profiler | 50 ms                               |
| Duration of a request | 2 s, the widget's delay                             | 2 minutes (60 s on a trial account) |

The CPU time was measured on a laptop, not on Fastly's hardware. A page with a
lot more to render can reach 50 ms. The whole stream, slowest request
included, has to end within the request's maximum duration.

## Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
