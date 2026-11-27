Hono speaks web `Request` and `Response`, so it needs no adapter: a route
passes `c.req.raw` to `createStreamingHandler()` from the core and returns the
streamed `Response` it gets back. The same app runs on Node, Bun, Deno and
Cloudflare Workers, and keeps API routes and the Angular app in one server.

This page sets it up on Node in full, then shows what changes on each of the
other runtimes. In the repository,
[`apps/example-hono`](../../../../../apps/example-hono/src/server.ts) is the
Node setup and
[`apps/example-hono-workers`](../../../../../apps/example-hono-workers/src/worker.ts)
the Workers one, as written here.

```bash
npm install @push-based/angular-stream-core@next hono @hono/node-server
npm install -D @hono/vite-dev-server
```

## Node

### 1. The browser config

<!-- include ../_shared/browser-config.md -->

### 2. The server config

<!-- include ../_shared/server-config.md -->

### 3. The server

```ts title="src/server.ts"
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { type Context, Hono } from 'hono';
import type { ViteDevServer } from 'vite';
import { App } from './app/app';
import { config } from './app/app.config.server';

/** In `vite dev`, @hono/vite-dev-server passes the app Vite's dev server as `c.env.vite`. */
type Env = { Bindings: { vite?: ViteDevServer } };

/** The browser build: dist/client, next to this file's dist/server. */
const client = fileURLToPath(new URL('../client/', import.meta.url));

const handle = createStreamingHandler<Env['Bindings']>({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  // The built index.html; in `vite dev`, the source one with Vite's transforms.
  loadTemplate: async (request, { vite }) =>
    new Response(
      vite
        ? await vite.transformIndexHtml(
            request.url,
            await readFile(`${vite.config.root}/index.html`, 'utf8'),
          )
        : await readFile(`${client}index.html`),
    ),
});

const page = (c: Context<Env>) => handle(c.req.raw, c.env);

const app = new Hono<Env>();

if (!import.meta.env.DEV) {
  // Before serveStatic, which would answer both with dist/client/index.html, the bare template.
  app.get('/', page);
  app.get('/index.html', page);
  app.use(serveStatic({ root: client }));
  // A missing hashed file (an old chunk after a deploy) is a 404, not a page.
  app.get('/assets/*', (c) => c.notFound());
}
app.get('*', page);

export default app;

// `vite dev` imports the app and serves it itself; the build listens.
if (!import.meta.env.DEV) {
  const port = Number(process.env['PORT'] ?? 3000);
  serve({ fetch: app.fetch, port }, ({ port }) =>
    console.log(`Listening on http://localhost:${port}`),
  );
}
```

Every request that reaches `page` is rendered as a page, so anything else goes
before it: the browser build's files through `serveStatic`, and your own routes
(`app.get('/api/...', ...)`) in the same place.

`loadTemplate` gives the handler the `index.html` to render into: the built
one, read from disk. `index.html` is the template, not the page, so `/` and
`/index.html` are routed to `page` before `serveStatic`, which would otherwise
answer both with that file as it is.

A request under `/assets/` that `serveStatic` doesn't find gets a `404`
instead of a page. Vite puts the build's hashed files there, so after a deploy
a browser still holding the old page asks for chunks that are gone; a page in
their place would fail to load as a script.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.

`eventDispatchContract` is for `withEventReplay()`. The built `index.html`
doesn't carry the script Angular needs to queue the clicks made before the page
hydrates, so the handler adds it. Leave it out and those clicks are lost.

### 4. Vite

```ts title="vite.config.ts"
import devServer from '@hono/vite-dev-server';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    // `vite build`: the browser app to dist/client, src/server.ts to dist/server.
    ngp({ ssr: { entry: 'src/server.ts' } }),
    // `vite dev`: every request Vite doesn't serve itself goes to the Hono app.
    devServer({ entry: 'src/server.ts', injectClientScript: false }),
  ],
});
```

ngp's `ssr` option builds the browser app into `dist/client` and the server
entry into `dist/server/server.js`, compiled by ngp's server compiler, with
Angular bundled in.

In `vite dev`, `@hono/vite-dev-server` loads `src/server.ts` through Vite and
hands it every request Vite doesn't serve itself, with the dev server as
`c.env.vite`. The template then comes from `transformIndexHtml`, which already
adds Vite's client, so `injectClientScript` stays off. The page streams in dev
as it does in production.

### 5. Build and run

```bash
vite build                  # client to dist/client, server to dist/server
node dist/server/server.js  # listens on $PORT, 3000 by default
```

`dist/server/server.js` reads `dist/client` relative to itself, so it runs from
any working directory. Deploy `dist` with `node_modules`: the server bundle
includes Angular, and imports the rest of its dependencies, Hono among them,
from there.

### 6. Stream something

<!-- include ../_shared/stream-something.md -->

## Middleware that buffers

Hono middleware that runs after the handler sees the whole `Response`. Most of
it only touches headers and leaves the body alone: `logger`, `secureHeaders`,
`timing`, `cors`, `requestId`, `timeout`, `poweredBy`, `trimTrailingSlash`,
`csrf` and `bodyLimit` all let the page stream. Two hold it back until the
stream ends, which takes away everything streaming buys:

- **`compress`** pipes the body through `CompressionStream`, which doesn't
  flush after each chunk. The browser gets the gzip header at once and the
  whole page when the stream ends, on Node, Bun, Deno and workerd alike.
- **`etag`** hashes the whole body before it sends anything.

That was checked with Hono 4.13.

Keep both off the page routes. To compress everything else, leave HTML out of
`compress`:

```ts
import { COMPRESSIBLE_CONTENT_TYPE_REGEX, compress } from 'hono/compress';

app.use(
  compress({
    contentTypeFilter: (type) =>
      !type.startsWith('text/html') && COMPRESSIBLE_CONTENT_TYPE_REGEX.test(type),
  }),
);
```

To compress the pages too, use a compressor that flushes after every chunk.
On Node, `zlib` does that with `Z_SYNC_FLUSH`:

```ts
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { constants, createGzip } from 'node:zlib';

app.use(async (c, next) => {
  await next();
  const html = c.res.headers.get('content-type')?.startsWith('text/html');
  if (!html || !c.res.body || !/\bgzip\b/.test(c.req.header('accept-encoding') ?? '')) {
    return;
  }
  const gzip = createGzip({ flush: constants.Z_SYNC_FLUSH });
  // Node's web stream types and the DOM's differ, though they're the same object at runtime.
  const body = Readable.fromWeb(c.res.body as NodeReadableStream).pipe(gzip);
  c.res = new Response(Readable.toWeb(body) as ReadableStream, c.res);
  c.res.headers.set('content-encoding', 'gzip');
  c.res.headers.delete('content-length');
  c.res.headers.append('vary', 'accept-encoding');
});
```

Each flush costs a little compression, and the shell still arrives at once.
This one was checked on Node only. The same goes for anything in front of the server: a proxy or
CDN that buffers or compresses without flushing undoes streaming just as
`compress` does.

## Cloudflare Workers

On Workers, compose with
[`@push-based/angular-stream-cloudflare`](../reference/cloudflare.md) instead of
calling the core yourself: `createStreamingWorker()` already loads the template
through the `ASSETS` binding. Hono routes your API, and the rest goes to the
Worker's `fetch`:

```ts title="src/worker.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { Hono } from 'hono';
import { App } from './app/app';
import { config } from './app/app.config.server';

const angular = createStreamingWorker({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
});

/** Hono routes the API; every other request is a page, rendered by the Worker as a stream. */
const app = new Hono<{ Bindings: Env }>();
app.get('/api/hello', (c) => c.json({ hello: 'from Hono' }));
// Cloudflare serves the files that exist, so an /assets/ request that gets here is
// a missing hashed file (an old chunk after a deploy): a 404, not a page.
app.get('/assets/*', (c) => c.notFound());
app.get('*', (c) => angular.fetch(c.req.raw, c.env));

export default app satisfies ExportedHandler<Env>;
```

There is no `serveStatic` here: with `assets.html_handling` set to `"none"`,
Cloudflare serves the browser build's files before a request reaches the
Worker. Everything else, from `wrangler.jsonc` and the Vite config to the
deploy, is as in [Cloudflare Workers](cloudflare-workers.md); only
`npm install hono` is new.

## Bun

On Bun, `serveStatic` comes from `@hono/bun` (`npm install @hono/bun`), and Bun serves the default
export itself: it has the `fetch` method Bun looks for. In `src/server.ts`,
drop the two `@hono/node-server` imports and the block that calls `serve()` at
the end, and load `serveStatic` where it's used:

```ts title="src/server.ts"
if (!import.meta.env.DEV) {
  // Imported here: @hono/bun doesn't load on Node, where `vite dev` runs the app.
  const { serveStatic } = await import('@hono/bun');
  // Before serveStatic, which would answer both with dist/client/index.html, the bare template.
  app.get('/', page);
  app.get('/index.html', page);
  app.use(serveStatic({ root: client }));
  // A missing hashed file (an old chunk after a deploy) is a 404, not a page.
  app.get('/assets/*', (c) => c.notFound());
}
app.get('*', page);

export default app;
```

`@hono/bun` reads files with `Bun.file`, and importing it on Node fails. `vite
dev` still runs the app on Node, through `@hono/vite-dev-server`, so the
import waits until the built server runs. Build with `vite build` as before,
then:

```bash
NODE_ENV=production bun dist/server/server.js  # listens on $PORT, 3000 by default
```

Without `NODE_ENV=production`, Bun starts the server in its development mode.

## Deno

On Deno it's the same change with `@hono/deno` (`npm install @hono/deno`), and `deno serve` serves the
default export:

```ts title="src/server.ts"
if (!import.meta.env.DEV) {
  // Imported here: @hono/deno doesn't load on Node, where `vite dev` runs the app.
  const { serveStatic } = await import('@hono/deno');
  // Before serveStatic, which would answer both with dist/client/index.html, the bare template.
  app.get('/', page);
  app.get('/index.html', page);
  app.use(serveStatic({ root: client }));
  // A missing hashed file (an old chunk after a deploy) is a 404, not a page.
  app.get('/assets/*', (c) => c.notFound());
}
app.get('*', page);

export default app;
```

Build with `vite build` on Node as before, then:

```bash
deno serve --allow-read --allow-env --allow-net --port 3000 dist/server/server.js
```

Deno resolves the bundle's imports from the app's `node_modules`, so run it
where they are installed.
