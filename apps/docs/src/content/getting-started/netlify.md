Netlify runs the renderer as a Netlify Function: Vite builds the browser app
into the publish directory and the server into one self-contained function
module, Netlify's CDN serves the files, and every other path reaches the
function, which streams the page. The setup below is the one
[`apps/example-netlify`](../../../../../apps/example-netlify/vite.config.ts)
uses. There is no Netlify package: the function is
`createStreamingHandler()` from the core, and the rest is build configuration.

## 1. The browser config

<!-- include ../_shared/browser-config.md -->

## 2. The server config

<!-- include ../_shared/server-config.md -->

## 3. The function

A Netlify Function takes a web `Request` and a `Context` and returns a
`Response`, which is what `createStreamingHandler()` is. Netlify streams a
`Response` whose body is a `ReadableStream`, up to 20 MB and within the
function's 60-second limit
([Functions configuration](https://docs.netlify.com/build/functions/configuration/)).

```ts title="src/function.ts"
import type { Config, Context } from '@netlify/functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingHandler } from '@push-based/angular-ssr-stream-core/server';
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

/**
 * Every path, unless a file in the publish directory matches it. A missing
 * file under `/assets/` is a 404, not a page.
 */
export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*'],
  preferStatic: true,
};
```

`path: '/*'` with `preferStatic: true` sends every request to the function
unless a file in the publish directory matches it: the files in `/assets/` and
`/favicon.ico` come from the CDN, and every navigation is rendered.

A path with no file behind it is a navigation to the function, so
`excludedPath` keeps it away from `/assets/`, where the build's hashed files
are. After a redeploy, a browser still running the previous build asks for
chunks that are gone. It gets Netlify's 404 for them, not a page with
`200 text/html` that fails as a script. Any other missing file, say
`/robots.txt`, is still rendered as a page and answers `200`: the renderer has
no SSR status codes. Exclude such paths too, or add the files to `public/`.

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

> [!NOTE]
> `netlify serve` (netlify-cli 27.20.1) ignores a Netlify Function's
> `excludedPath`, so locally `/assets/missing.js` is rendered as a page. The
> excluded paths are in the function's manifest, and `netlify deploy` uploads
> them with it.

## 4. Vite

Netlify doesn't run Vite, so the build has to hand it a function it can deploy
as it is: one module, with Angular compiled and every dependency bundled in.
The mode picks what is built: `vite build` builds the Netlify Function, and
`vite build --mode edge` builds the [Edge Function](#edge-functions). Each
variant goes to its own folder, so both can be built side by side.

```ts title="vite.config.ts"
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ngp } from '@push-based/vite-plugin-ngp';
import { type Plugin, type ViteDevServer, defineConfig, isRunnableDevEnvironment } from 'vite';

export default defineConfig(({ command, mode }) => {
  const edge = mode === 'edge';
  const out = edge ? 'dist/edge' : 'dist/function';
  const entry = edge ? 'src/edge-function.ts' : 'src/function.ts';

  return {
    optimizeDeps: { entries: ['index.html'] },
    builder: {},
    environments: {
      client: { build: { outDir: `${out}/client` } },
      ssr: {
        // Netlify doesn't install the app's dependencies for the function.
        resolve: { noExternal: command === 'build' || undefined },
        build: {
          outDir: `${out}/netlify/${edge ? 'edge-functions' : 'functions'}/ssr`,
          copyPublicDir: false,
          rolldownOptions: {
            input: { ssr: entry },
            output: { entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
          },
        },
      },
    },
    plugins: [ngp({ entries: ['src/main.ts', entry] }), netlifyFunction(entry)],
  };
});

function netlifyFunction(entry: string): Plugin {
  let root = '';
  let publicDir = '';
  let clientOutDir = '';
  let server: ViteDevServer | undefined;

  return {
    name: 'netlify-function',
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
      clientOutDir = path.resolve(root, config.environments['client']?.build.outDir ?? 'dist');
    },
    resolveId: {
      filter: { id: /^virtual:(template|public-paths)$/ },
      handler: (id) => `\0${id}`,
    },
    load: {
      filter: { id: /^\0virtual:(template|public-paths)$/ },
      async handler(id) {
        if (id === '\0virtual:public-paths') {
          const files = publicDir
            ? await readdir(publicDir, { recursive: true, withFileTypes: true })
            : [];
          const paths = files
            .filter((file) => file.isFile())
            .map(
              (file) =>
                `/${path
                  .relative(publicDir, path.join(file.parentPath, file.name))
                  .split(path.sep)
                  .join('/')}`,
            );
          return `export default ${JSON.stringify(paths.sort())};`;
        }
        const html = server
          ? await server.transformIndexHtml(
              '/',
              await readFile(path.join(root, 'index.html'), 'utf8'),
            )
          : await readFile(path.join(clientOutDir, 'index.html'), 'utf8');
        return `export default ${JSON.stringify(html)};`;
      },
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
          if (
            (req.method !== 'GET' && req.method !== 'HEAD') ||
            !req.headers.accept?.includes('text/html')
          ) {
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
            const response = await handle(new Request(url, { method: req.method, headers }), {});
            res.writeHead(response.status, [...response.headers].flat());
            if (req.method === 'HEAD' || !response.body) {
              await response.body?.cancel();
              res.end();
              return;
            }
            // Each chunk is written as soon as the function sends it, and the
            // render stops when the browser goes away.
            const reader = response.body.getReader();
            res.on('close', () => void reader.cancel().catch(() => {}));
            for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
              res.write(chunk.value);
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

- **`vite build` builds both halves**: `builder: {}` builds the browser app
  into `dist/function/client`, then the `ssr` environment, whose input is the
  function. ngp compiles the function with its server compiler; its own `ssr`
  option stays off, since that one expects a `render(url, document)` entry.
- **One module per function.** `noExternal` bundles every dependency into the
  build, and the function lands in its own folder,
  `dist/function/netlify/functions/ssr/ssr.mjs`, with its lazy chunks in
  `chunks/`: Netlify takes every file at the top of the functions directory
  for a function of its own. Netlify reads the `config` export from the built
  file.
- **`virtual:template`** is the browser build's `index.html`, read once the
  browser build has written it. In `vite dev` it is `index.html` as the dev
  server serves it, with Vite's client in it.
- **`virtual:public-paths`** lists the files in `public/` as URL paths, for the
  Edge Function's `excludedPath`. The Netlify Function doesn't need it.
- **`index.html` leaves the publish directory.** `preferStatic` serves a file
  that matches the path, and `index.html` matches `/`: left there, the home page
  would be the unrendered template. The function has its own copy.
- **`vite dev` streams.** Each page request (`GET` or `HEAD`) goes to the
  function, loaded through the `ssr` environment, and each chunk of its
  `Response` is written as it arrives, so the dev server streams the way the
  deployed function does. When the browser closes the connection, the body is
  cancelled and the render stops.

Add the type of the second virtual module next to the first:

```ts title="src/virtual.d.ts"
/** The files in `public/`, as URL paths (`/favicon.ico`), listed by vite.config.ts. */
declare module 'virtual:public-paths' {
  const paths: `/${string}`[];
  export default paths;
}
```

## 5. netlify.toml

```toml title="netlify.toml"
[build]
command = "pnpm nx build example-netlify"
publish = "apps/example-netlify/dist/function/client"

[build.environment]
NODE_VERSION = "26"

[functions]
directory = "apps/example-netlify/dist/function/netlify/functions"
```

The example lives in a pnpm workspace, so the site's base directory is the
repository root, where the workspace installs, and its package directory is
`apps/example-netlify`, where `netlify.toml` is. Paths in it are relative to the
base directory. In a repository with one app at its root, they are
`dist/function/client` and `dist/function/netlify/functions`, and the command is
`vite build`. The example's `build` script builds both variants, so its
command builds the Edge Function too. `netlify.toml` names only the
Function's folders, so only the Function is deployed.

`NODE_VERSION` is the Node.js version the build runs on. Netlify installs any
version nvm can, and defaults to Node.js 24
([Manage dependencies](https://docs.netlify.com/build/configure-builds/manage-dependencies/)).
This workspace needs 26. The function then runs on the build's version if AWS
Lambda offers it as a runtime, and on Node.js 24 otherwise
([Functions configuration](https://docs.netlify.com/build/functions/configuration/)).
The bundled function streams the same under Node.js 24.

## 6. Build and deploy

```bash
pnpm nx build example-netlify   # dist/function (and dist/edge, the Edge Function)
netlify serve --filter example-netlify
```

`netlify serve` runs the build command, packages the function the way a deploy
does, and serves the result on `http://localhost:8888`, without an account or a
linked site. It is the closest local check of what Netlify will run.

To deploy from the command line, run this at the repository root:

```bash
netlify deploy --build --filter example-netlify
```

`--filter` picks the app's package directory, as for `netlify serve`. A site
built by Netlify from the repository needs its package directory as well, and
that can only be set in the Netlify UI: **Project configuration > Developer
settings > Continuous deployment > Build settings > Package directory**, set to
`apps/example-netlify`. Netlify reads `netlify.toml` from the package directory,
then the base directory, then the repository root
([Monorepos](https://docs.netlify.com/build/configure-builds/monorepos/)).
Without the package directory, the build never reads
`apps/example-netlify/netlify.toml`.

> [!NOTE]
> The example streams under `netlify serve`: the shell arrives at once and the
> widget's chunk about 2 s later. It hasn't been timed against a deployed site
> yet, so whether anything between Netlify's CDN and the browser buffers the
> response is still open. Check with `curl -N` against your deploy, as
> [Debugging and verifying](../guides/debugging.md) describes.

## 7. Stream something

<!-- include ../_shared/stream-something.md -->

## Edge Functions

The same handler runs as a Netlify Edge Function, on Deno at the edge. The
example builds it with `vite build --mode edge` and the same Vite config.
Netlify's bundler accepts it, and under `netlify serve` it streams and
hydrates like the Netlify Function. The bundle isn't free of Node.js, though:
Rolldown's runtime imports `createRequire` from `node:module`, and Angular's
server XHR fallback is a lazy `xhr2` chunk that calls `require("http")`. Both
load only because Deno supports `node:` modules. The example never loads the
`xhr2` chunk, because its HTTP backend answers in-process. Whether it runs
there for an app that makes real HTTP requests hasn't been checked;
`provideHttpClient(withFetch())` keeps Angular off it.

```ts title="src/edge-function.ts"
import type { Config, Context } from '@netlify/edge-functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingHandler } from '@push-based/angular-ssr-stream-core/server';
import publicPaths from 'virtual:public-paths';
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

/**
 * Edge Functions have no `preferStatic`: the build's assets and the files in
 * `public/`, listed at build time by vite.config.ts, are left out by path.
 */
export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*', ...publicPaths],
};
```

What changes:

- **No `preferStatic`.** Edge Functions don't have it
  ([Declarations](https://docs.netlify.com/build/edge-functions/declarations/)):
  every path that `path` matches reaches the function, files included. So the
  paths it must not answer are excluded: the build's `/assets/*`, and each
  file in `public/`, which the build lists as `virtual:public-paths`. A file
  added to `public/` is excluded at the next build. A missing file under
  `/assets/` gets Netlify's 404, as with the Function.
- **The build output.** `vite build --mode edge` writes the browser app to
  `dist/edge/client` and the Edge Function to
  `dist/edge/netlify/edge-functions/ssr/`. `netlify.toml` names both and has no
  `[functions]`:

  ```toml title="netlify.toml"
  [build]
  command = "pnpm nx build example-netlify"
  publish = "apps/example-netlify/dist/edge/client"
  edge_functions = "apps/example-netlify/dist/edge/netlify/edge-functions"
  
  [build.environment]
  NODE_VERSION = "26"
  ```

  Deploy one or the other, never both: an Edge Function on `/*` runs first and
  answers every page, so the Netlify Function would never be called.

- **50 ms of CPU per request**, Netlify's limit for Edge Functions, which
  counts the time spent running code but not time spent waiting
  ([Limits](https://docs.netlify.com/build/edge-functions/limits/)). Measured
  in Deno 2.9 on an Apple M-series laptop, the example's bundle took about 13 ms
  to load and 22 ms for its first render, then about 4 ms per render. A real
  page renders more, on slower machines, and a cold start pays for loading
  Angular too. Netlify Functions have no such limit, which makes them the safer
  default; choose the edge when the page renders well within it.

`@netlify/edge-functions` is only needed for its types:
`pnpm add -D @netlify/edge-functions`.
