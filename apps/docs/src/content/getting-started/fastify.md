This is the setup `apps/example-fastify` in the repository uses: Angular
compiled by ngp through Vite, the server bundle run by Node as a Fastify app,
an API route next to the pages, the browser build served by `@fastify/static`,
and every other `GET` rendered as a streamed page by the `angularStream`
plugin. The plugin is built on the [Node adapter](node.md), and dev mode uses
its Vite plugin.

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

`streamHttpInterceptor` reports each request to the renderer on the server,
and in the browser holds back a request the server is already making until its
response arrives on the stream. `provideStreamHydration()` keeps Angular's
hydration data and block registry in step with the chunks.

## 2. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 3. The server

```bash
npm install fastify @fastify/static @fastify/compress
```

```ts title="src/server.ts"
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import { angularStream } from '@push-based/angular-stream-fastify';
import Fastify from 'fastify';
import { App } from './app/app';
import { config } from './app/app.config.server';

const app = Fastify({ logger: true });

// Before the routes it compresses. `flushOnIdle` sends each chunk of a page
// as it comes, instead of the whole page at the end.
app.register(fastifyCompress, { flushOnIdle: true });

// The API, in a plugin so that its routes are added once @fastify/compress has loaded.
app.register(
  async (api) => {
    api.get('/health', async () => ({ status: 'ok' }));
  },
  { prefix: '/api' },
);

if (import.meta.env.PROD) {
  // The browser build, one route per file; `vite dev` serves these itself.
  // Not `wildcard: true`, the default: its `GET /*` would clash with the pages'.
  app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../client/', import.meta.url)),
    wildcard: false,
    // `index.html` is the template, not a page: `/` is rendered.
    globIgnore: ['**/*.html'],
  });
}

// Every other `GET` and `HEAD` is a page.
app.register(angularStream, {
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  template: new URL('./index.server.html', import.meta.url),
});

/**
 * `vite dev` calls this for each page request, with the dev template on `req`
 * and `req.url` rewritten to `/index.html`; Fastify routes the URL the browser
 * asked for.
 */
export default function handle(
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  next: (error?: unknown) => void,
): void {
  req.url = req.originalUrl ?? req.url;
  app.ready().then(() => app.routing(req, res), next);
}

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  app.listen({ port }).catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
}
```

The file is built to `dist/server/server.js`, so both URLs are relative to
that: the template is `dist/server/index.server.html`, and the static root is
the browser build in `dist/client`.

The plugin registers one route, `GET` and `HEAD` on `/*`. Fastify picks the
most specific route for a URL whatever order they were registered in, so
`/api/health` and every file of the browser build are answered by their own
routes, and everything else is rendered as a page. A `POST` or a `PUT` to a
path no route has gets Fastify's `404`.

`@fastify/static` needs `wildcard: false`. With its default, it registers a
`GET /*` route of its own, and Fastify refuses to start with two. Without the
wildcard it registers a route per file it finds at startup. `globIgnore`
leaves out `index.html`, which is the browser build's copy of the template and
would otherwise be served as `/index.html` and `/`, unrendered.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.
Behind a proxy that rewrites the host, see
[`trustProxy`](../reference/fastify.md#angularstream).

`eventDispatchContract` is for `withEventReplay()`. The plugin adds it to the
template unless it's there already, so a click made before the page hydrates is
queued and replayed. Leave it out and those clicks are lost; the server logs a
warning when that happens.

`@fastify/compress` has to be registered before the plugin, and needs
`flushOnIdle: true`; see [7. Compression](#7-compression).

## 4. Vite

```ts title="vite.config.ts"
import { angularStreamNode } from '@push-based/angular-stream-node/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    angularStreamNode({ entry: 'src/server.ts' }),
    ngp({ ssr: { entry: 'src/server.ts' } }),
  ],
});
```

ngp's `ssr` option builds the browser app into `dist/client` and the server
entry into `dist/server`, next to `index.server.html`: the built `index.html`
plus the event dispatch contract.

`angularStreamNode()`, from the Node adapter, is for `vite dev`. It calls your
server entry's default export with each page request, and with `index.html`,
as the dev server transforms it, left on the request. List it before ngp, or
the dev server refuses to start. In a build it does nothing.

The default export is what makes this work with Fastify. The plugin calls it
as a `node:http` request listener, `(req, res, next)`, and a Fastify instance
isn't one. `handle()` in `src/server.ts` waits for the app to be ready, then
hands the raw request to Fastify's router with `app.routing(req, res)`; the
page route passes that same raw request on to the template loader, which finds
the dev template on it. It restores `req.url` first: Vite has rewritten it to
`/index.html` by then, and Fastify would route and log that instead.
`import.meta.env.PROD` is `false` in dev, so the module doesn't listen on a
port of its own, and `@fastify/static` isn't registered: Vite serves the
browser files.

## 5. Develop

```bash
vite dev   # http://localhost:5173
```

The dev server serves the sources, and every page is rendered by your Fastify
app and streamed, compressed by `@fastify/compress` as in production.

Only page requests reach the app in dev: the Vite plugin hands it a `GET` or
`HEAD` that asks for HTML (`Accept: text/html`), and leaves everything else
to Vite. A `fetch('/api/health')` from the app therefore gets Vite's answer,
not your route's. Run the built server to work on the API, or proxy it from
`vite dev` to a second instance with Vite's `server.proxy`. To check a page
with `curl` in dev, send the header a browser sends:

```bash
curl -sN -H 'Accept: text/html' http://localhost:5173/
```

## 6. Build and run

```json title="package.json"
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node dist/server/server.js"
  }
}
```

```bash
vite build                      # client to dist/client, server to dist/server
node dist/server/server.js      # http://localhost:3000, or $PORT
```

`dist/server/server.js` still imports the packages Vite left out of the
bundle, Fastify and its plugins among them, so run it where the app's
`node_modules` are, or install the production dependencies next to `dist/` in
your image. Angular is bundled.

`app.listen({ port })` listens on `localhost` only, which is Fastify's
default. In a container, or anywhere the server must be reached from another
machine, listen on every interface with `app.listen({ port, host: '0.0.0.0' })`.

Check that it streams before you put anything in front of it:

```bash
curl -sN -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
```

```text
20:30:32.400163 <= Recv data, 3065 bytes (0xbf9)
20:30:34.402703 <= Recv data, 812 bytes (0x32c)
```

That's the example: the shell at once, and the widget's chunk two seconds
later, when its data is there. One line for the whole page means something
buffered it; see
[Checking that a response streams](../guides/streaming-through-proxies.md#checking-that-a-response-streams).

## 7. Compression

`@fastify/compress` compresses a page in an `onSend` hook, and by default
holds the compressed output until the page is complete. With
`app.register(fastifyCompress)` alone, the example's page arrives in one piece
when the widget is done:

```bash
curl -sN --compressed http://localhost:3000/ | perl -MTime::HiRes=time -ne '
  BEGIN { $t0 = time }
  printf "%5d ms  %s\n", (time - $t0) * 1000, $& if /data-placeholder|<template data-ngs="\w+"/'
```

```text
 2003 ms  data-placeholder
 2003 ms  <template data-ngs="d0"
```

`flushOnIdle: true` flushes the compressor whenever the page pauses, which is
after each chunk, without resetting the compression state. With it, the same
request streams, for gzip, Brotli, deflate and zstd alike:

```text
    0 ms  data-placeholder
 2002 ms  <template data-ngs="d0"
```

Register `@fastify/compress` before the plugin: it hooks into each route as it
is added, and doesn't touch routes added before it has loaded. A route added
with `app.get()` at the top level is added at once, before any plugin has
loaded, which is why the example's API is a plugin too.

To leave pages out of compression instead, and let a proxy in front compress
them, pass the route option `@fastify/compress` reads:

```ts
app.register(angularStream, {
  // ...
  route: { compress: false },
});
```

Scripts, styles and API responses are still compressed.

## 8. Behind a proxy

A proxy or a CDN can hold the response back until it is complete, and the page
then arrives all at once. The plugin sends `X-Accel-Buffering: no` for Nginx;
for the rest, read
[Streaming through proxies](../guides/streaming-through-proxies.md).

If you set Fastify's `handlerTimeout`, it limits the whole streamed response,
not just the time to the shell: when it runs out mid-page, Fastify cuts the
connection. Give the page route a longer one with
`route: { handlerTimeout: 30_000 }`.

## 9. Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
