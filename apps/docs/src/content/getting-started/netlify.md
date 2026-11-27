Netlify runs the renderer as a Netlify Function: Vite builds the browser app
into the publish directory and the server into one self-contained function
module, Netlify's CDN serves the files, and every other path reaches the
function, which streams the page. The setup below is the one
[`apps/example-netlify`](../../../../../apps/example-netlify/vite.config.ts)
uses. There is no Netlify package: the function is
`createStreamingHandler()` from the core, and the rest is build configuration.

## 1. The browser config

Add the interceptor and the stream's providers next to Angular's hydration:

```ts title="src/app/app.config.ts"
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration(): it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

## 2. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 3. The function

A Netlify Function takes a web `Request` and a `Context` and returns a
`Response`, which is what `createStreamingHandler()` is. Netlify streams a
`Response` whose body is a `ReadableStream`, for up to 60 seconds and 20 MB.

```ts title="src/function.ts"
import type { Config, Context } from '@netlify/functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import template from 'virtual:template';
import { App } from './app/app';
import { config as appConfig } from './app/app.config.server';

export default createStreamingHandler<Context>({
  rootComponent: App,
  config: appConfig,
  eventDispatchContract,
  allowedHosts: ['localhost', '*.netlify.app'],
  // The built index.html, bundled into the function by vite.config.ts.
  loadTemplate: async () => new Response(template),
});

/** Every path, unless a file in the publish directory matches it. */
export const config: Config = {
  path: '/*',
  preferStatic: true,
};
```

`path: '/*'` with `preferStatic: true` sends every request to the function
unless a file in the publish directory matches it: `/assets/*` and
`/favicon.ico` come from the CDN, and every navigation is rendered.

`allowedHosts` must list every hostname the site answers for, your own domain
included: Angular's SSR host guard rejects any other `host` header, and the
function answers `403`. `*.netlify.app` covers the site's Netlify address and
its deploy previews.

`eventDispatchContract` is for `withEventReplay()`: the built `index.html`
doesn't carry the script Angular needs to queue the clicks made before the page
hydrates, so the handler adds it.

The template is the built `index.html`, as a string inside the function
(`virtual:template`, below). Nothing is read from disk or fetched per request,
and the same code runs as an Edge Function. Add its type:

```ts title="src/virtual.d.ts"
/** The built `index.html`, bundled into the function by vite.config.ts. */
declare module 'virtual:template' {
  const html: string;
  export default html;
}
```

`@netlify/functions` is only needed for its types: `pnpm add -D @netlify/functions`.

## 4. Vite

Netlify doesn't run Vite, so the build has to hand it a function it can deploy
as it is: one module, with Angular compiled and every dependency bundled in.

```ts title="vite.config.ts"
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ngp } from '@push-based/vite-plugin-ngp';
import { type Plugin, type ViteDevServer, defineConfig, isRunnableDevEnvironment } from 'vite';

export default defineConfig(({ command }) => ({
  optimizeDeps: { entries: ['index.html'] },
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      // Netlify doesn't install the app's dependencies for the function.
      resolve: { noExternal: command === 'build' || undefined },
      build: {
        outDir: 'dist/netlify/functions/ssr',
        copyPublicDir: false,
        rolldownOptions: {
          input: { ssr: 'src/function.ts' },
          output: { entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
        },
      },
    },
  },
  plugins: [
    ngp({ entries: ['src/main.ts', 'src/function.ts'] }),
    netlifyFunction('src/function.ts'),
  ],
}));

function netlifyFunction(entry: string): Plugin {
  let root = '';
  let clientOutDir = '';
  let server: ViteDevServer | undefined;

  return {
    name: 'netlify-function',
    configResolved(config) {
      root = config.root;
      clientOutDir = path.resolve(root, config.environments['client']?.build.outDir ?? 'dist');
    },
    resolveId: {
      filter: { id: /^virtual:template$/ },
      handler: (id) => `\0${id}`,
    },
    load: {
      filter: { id: /^\0virtual:template$/ },
      async handler() {
        const html = server
          ? await server.transformIndexHtml(
              '/',
              await readFile(path.join(root, 'index.html'), 'utf8'),
            )
          : await readFile(path.join(clientOutDir, 'index.html'), 'utf8');
        return `export default ${JSON.stringify(html)};`;
      },
    },
    async buildStart() {
      if (this.environment.name === 'ssr') {
        await rm(path.join(root, 'dist/netlify'), { recursive: true, force: true });
      }
    },
    async writeBundle() {
      if (this.environment.name === 'ssr') {
        await rm(path.join(clientOutDir, 'index.html'));
      }
    },
    configureServer(devServer) {
      server = devServer;
      // After Vite's own middlewares, so modules and the files in `public/` are served first.
      return () => {
        devServer.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' || !req.headers.accept?.includes('text/html')) {
            return next();
          }
          void (async () => {
            const environment = devServer.environments['ssr'];
            if (!environment || !isRunnableDevEnvironment(environment)) {
              throw new Error('the ssr environment has no module runner');
            }
            const { default: handle } = await environment.runner.import<{
              default: (request: Request, context: unknown) => Promise<Response>;
            }>(entry);
            const headers = new Headers();
            for (const [name, value] of Object.entries(req.headers)) {
              if (typeof value === 'string') {
                headers.set(name, value);
              }
            }
            const url = new URL(req.originalUrl ?? req.url ?? '/', `http://${req.headers.host}`);
            const response = await handle(new Request(url, { headers }), {});
            res.writeHead(response.status, [...response.headers].flat());
            // Each chunk is written as soon as the function sends it.
            for await (const chunk of response.body ?? []) {
              res.write(chunk);
            }
            res.end();
          })().catch((error: unknown) => {
            if (error instanceof Error) {
              devServer.ssrFixStacktrace(error);
            }
            next(error);
          });
        });
      };
    },
  };
}
```

What each part is for:

- **`vite build` builds both**: `builder: {}` builds the browser app into
  `dist/client`, then the `ssr` environment, whose input is the function.
  ngp compiles the function with its server compiler; its own `ssr` option stays
  off, since that one expects a `render(url, document)` entry.
- **One module per function.** `noExternal` bundles every dependency into the
  build, and the function lands in its own folder,
  `dist/netlify/functions/ssr/ssr.mjs`, with its lazy chunks in `chunks/`:
  Netlify takes every file at the top of the functions directory for a
  function of its own. Netlify reads the `config` export from the built file.
- **`virtual:template`** is the browser build's `index.html`, read once the
  browser build has written it. In `vite dev` it is `index.html` as the dev
  server serves it, with Vite's client in it.
- **`index.html` leaves the publish directory.** `preferStatic` serves a file
  that matches the path, and `index.html` matches `/`: left there, the home page
  would be the unrendered template. The function has its own copy.
- **`vite dev` streams.** Each page request goes to the function, loaded
  through the `ssr` environment, and each chunk of its `Response` is written as
  it arrives, so the dev server streams the way the deployed function does.

## 5. netlify.toml

```toml title="netlify.toml"
[build]
command = "pnpm nx build example-netlify"
publish = "apps/example-netlify/dist/client"

[functions]
directory = "apps/example-netlify/dist/netlify/functions"
```

The example lives in a pnpm workspace, so the site's base directory is the
repository root, where the workspace installs, and its package directory is
`apps/example-netlify`, where `netlify.toml` is. Paths in it are relative to the
base directory. In a repository with one app at its root, they are
`dist/client` and `dist/netlify/functions`, and the command is `vite build`.

## 6. Build and deploy

```bash
pnpm nx build example-netlify   # client to dist/client, function to dist/netlify/functions
netlify serve --filter example-netlify
```

`netlify serve` runs the build command, packages the function the way a deploy
does, and serves the result on `http://localhost:8888`, without an account or a
linked site. It is the closest local check of what Netlify will run.
`netlify deploy --build`, or a site connected to the repository, deploys it.

> [!NOTE]
> The example streams under `netlify serve`: the shell arrives at once and the
> widget's chunk about 2 s later. It hasn't been timed against a deployed site
> yet, so whether anything between Netlify's CDN and the browser buffers the
> response is still open. Check with `curl -N` against your deploy, as
> [Debugging and verifying](../guides/debugging.md) describes.

## 7. Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).

## Edge Functions

The same handler runs as a Netlify Edge Function, on Deno at the edge. The
Angular server bundle needs nothing a Workers-style runtime lacks: the example
builds it with the same Vite config, Netlify's bundler accepts it, and under
`netlify serve` it streams and hydrates like the Netlify Function.

```ts title="src/edge-function.ts"
import type { Config, Context } from '@netlify/edge-functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import template from 'virtual:template';
import { App } from './app/app';
import { config as appConfig } from './app/app.config.server';

export default createStreamingHandler<Context>({
  rootComponent: App,
  config: appConfig,
  eventDispatchContract,
  allowedHosts: ['localhost', '*.netlify.app'],
  loadTemplate: async () => new Response(template),
});

export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*', '/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'],
};
```

What changes:

- **No `preferStatic`.** Edge Functions don't have it: every path that `path`
  matches reaches the function, files included, so the paths it must not answer
  are excluded by name: the build's `/assets/*` and each file in `public/`.
- **The build output.** The example builds it with `vp build --mode edge`
  (`pnpm nx build:edge example-netlify`), into
  `dist/netlify/edge-functions/ssr/`, and `netlify.toml` names that folder:
  `edge_functions = "apps/example-netlify/dist/netlify/edge-functions"` under
  `[build]`. Deploy one or the other, never both: an Edge Function on `/*` runs
  first and answers every page, so the Netlify Function would never be called.
  The example's build deletes `dist/netlify` before writing either.
- **50 ms of CPU per request**, Netlify's limit for Edge Functions, which
  counts all the time spent running the code. Measured in Deno 2.9 on an Apple
  M-series laptop, the example's bundle took about 13 ms to load and 22 ms for
  its first render, then about 4 ms per render. A real page renders more, on
  slower machines, and a cold start pays for loading Angular too. Netlify
  Functions have no such limit, which makes them the safer default; choose the
  edge when the page renders well within it.

`@netlify/edge-functions` is only needed for its types:
`pnpm add -D @netlify/edge-functions`.
