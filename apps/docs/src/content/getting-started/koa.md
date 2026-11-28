Koa runs on Node, so it uses the Node adapter's pieces: `toWebRequest()`
turns `ctx.req` into a web `Request`, the core renders it, and the streamed
body goes to `ctx.body`, where Koa pipes it to the socket like any other
stream. Everything else is ordinary Koa: `koa-static` for the browser build,
`koa-compress` set to flush each chunk, API routes next to the pages, and the
Node adapter's Vite plugin for `vite dev`.

[`apps/example-koa`](../../../../../apps/example-koa/src/server.ts) in the
repository is this setup, as written here.

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-node@next koa koa-static koa-compress
npm install -D @types/koa @types/koa-static
```

`koa-compress` 5.2 and later ship their own types.

## 1. The browser config

<!-- include ../_shared/browser-config.md -->

## 2. The server config

<!-- include ../_shared/server-config.md -->

## 3. The server

```ts title="src/server.ts"
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingHandler } from '@push-based/angular-ssr-stream-core/server';
import {
  BadRequestError,
  createTemplateLoader,
  toWebRequest,
} from '@push-based/angular-ssr-stream-node';
import Koa, { type Context } from 'koa';
import compress from 'koa-compress';
import serve from 'koa-static';
import { App } from './app/app';
import { config } from './app/app.config.server';

const client = fileURLToPath(new URL('../client/', import.meta.url));

const render = createStreamingHandler<IncomingMessage>({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  // The built template; in `vite dev`, the dev server's, which the plugin leaves on `ctx.req`.
  loadTemplate: createTemplateLoader(new URL('./index.server.html', import.meta.url)),
});

/**
 * Renders a `GET` or `HEAD` as a page and hands the streamed body to Koa,
 * which pipes it to the socket. Other methods go on to `next`.
 */
async function page(ctx: Context, next: Koa.Next): Promise<void> {
  if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
    return next();
  }
  let request: Request;
  try {
    request = toWebRequest(ctx.req, ctx.res);
  } catch (error) {
    // A Host that is more than a host and a port: a 400 for the client, not an error to log.
    if (error instanceof BadRequestError) {
      ctx.throw(400, error.message);
    }
    throw error;
  }
  const response = await render(request, ctx.req);
  ctx.status = response.status;
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') {
      ctx.set(name, value);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    ctx.set('Set-Cookie', cookies);
  }
  // Nginx buffers proxied responses unless told not to.
  ctx.set('X-Accel-Buffering', 'no');
  if (response.body !== null) {
    ctx.body = Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>);
  }
}

const app = new Koa();

// Koa logs every error. A client that leaves mid-stream closes the response
// early, which is not one; the render has stopped by then.
app.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
    app.onerror(error);
  }
});

// Flush after every write, so each chunk leaves compressed instead of waiting for the end.
app.use(
  compress({
    gzip: { flush: zlib.constants.Z_SYNC_FLUSH },
    deflate: { flush: zlib.constants.Z_SYNC_FLUSH },
    br: { flush: zlib.constants.BROTLI_OPERATION_FLUSH },
    // zlib.constants.ZSTD_e_flush, which @types/node 20 doesn't list.
    zstd: { flush: 1 },
  }),
);

app.use(async (ctx, next) => {
  if (ctx.method === 'GET' && ctx.path === '/api/hello') {
    ctx.body = { hello: 'from Koa' };
    return;
  }
  await next();
});

if (import.meta.env.PROD) {
  // The browser build, but not its index.html: that is the bare template, and pages are rendered.
  const files = serve(client, {
    index: false,
    // Vite names the files in assets/ by their content hash.
    setHeaders: (res, file) => {
      if (path.relative(client, file).startsWith(`assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.use((ctx, next) => {
    // Decoded and lowercased as koa-send (and a case-insensitive disk) would see it,
    // so `/index%2Ehtml` and `/INDEX.HTML` are pages too.
    let decoded = ctx.path;
    try {
      decoded = decodeURIComponent(ctx.path);
    } catch {
      // Malformed: koa-send answers it.
    }
    return decoded.toLowerCase().endsWith('.html') ? next() : files(ctx, next);
  });
  // A hashed file that no longer exists (an old chunk after a deploy) is a 404, not a page.
  app.use((ctx, next) => (ctx.path.startsWith('/assets/') ? ctx.throw(404) : next()));
}

app.use(page);

// `vite dev` imports this module for its default export, and serves it itself.
export default app.callback();

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
```

The file is built to `dist/server/server.js`, so both URLs are relative to
that: the template is `dist/server/index.server.html`, and `client` is the
browser build in `dist/client`.

### Why `ctx.body`

There are two ways to answer from Koa with a Node handler. One sets
`ctx.respond = false` and hands `ctx.req` and `ctx.res` to
[`createNodeHandler()`](../reference/node.md#createnodehandler), which then
writes the response itself. Koa no longer sees it: middleware wrapped around
the handler gets control back before the page has been sent, with whatever
status was there at that moment, `koa-compress` has no body to compress, and
an error during the render never reaches Koa's error handling.

This page does the other: the status and headers go to `ctx.status` and
`ctx.set()`, and the body goes to `ctx.body` as a Node stream. That still
streams. Koa pipes a stream body to the socket as it reads it, one write per
chunk, so the shell goes out at once and each block when it is ready. And Koa
stays in charge of the response:

- A logger or any other middleware around `page` sees the real status.
- `koa-compress` compresses the stream, and flushes each chunk with the
  options above (see [Compression](#7-compression)).
- An error thrown before the response starts goes through Koa's error
  handling, and your own `try`/`catch` middleware if you have one: a
  `BadRequestError` becomes a `400`, anything else a `500`.
- For a `HEAD` request, Koa sends the headers and destroys the body, which
  cancels the render.
- When the client goes away mid-stream, Koa destroys the body too, and the
  render stops. Koa reports that as an `ERR_STREAM_PREMATURE_CLOSE` error,
  which the `error` listener above keeps out of the logs. An error in the
  middle of the body still cuts the connection and is logged.

Koa 3 also takes a web `Response` as `ctx.body` directly. It copies the
status and headers, but joins several `Set-Cookie` headers into one, and
leaves the render running for a `HEAD` request, so this page copies them
itself and passes a Node stream.

### The rest of the server

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.

`eventDispatchContract` is for `withEventReplay()`. The renderer adds it to
the template unless it's there already, so a click made before the page
hydrates is queued and replayed.

`page` renders every `GET` and `HEAD` that reaches it, so mount whatever
answers those first: API routes, like `/api/hello` here, and `koa-static`.
Other methods pass through to `next`, for routes after it, and get Koa's `404`
when there are none.

`koa-static` serves the browser build's files from `dist/client`. Two of its
defaults don't fit: `index: false` stops it from answering `/` with
`dist/client/index.html`, the bare template, and the `.html` check in front of
it does the same for `/index.html`, so both are rendered as pages. Files in
`assets/` are named by their content hash and cached for a year. It is only
mounted in the build: in `vite dev`, Vite serves the files.

`koa-static` goes after `koa-compress`, so scripts and styles are compressed
too, and after the API routes, so a file can't shadow one. A missing file
under `/assets/`, such as an old hashed chunk after a deploy, gets a `404`;
any other path that isn't a file falls through to `page` and is rendered.

## 4. Vite

```ts title="vite.config.ts"
import { angularStreamNode } from '@push-based/angular-ssr-stream-node/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    angularStreamNode({ entry: 'src/server.ts', routes: ['/api'] }),
    ngp({ ssr: { entry: 'src/server.ts' } }),
  ],
});
```

ngp's `ssr` option builds the browser app into `dist/client` and the server
entry into `dist/server`, next to `index.server.html`: the built `index.html`
plus the event dispatch contract.

`angularStreamNode()` is for `vite dev`. It sends each page request to the
server entry's default export as `(req, res, next)`, with `index.html`, as the
dev server transforms it, left on `req`. `app.callback()` is a function of that
shape, and the loader from `createTemplateLoader()` finds the template on
`ctx.req`, which is that same `req`. List the plugin before ngp, or the dev
server refuses to start. See
[What the server entry default-exports](../reference/node.md#what-the-server-entry-default-exports).

On its own, the plugin sends the app page requests only, `GET`s and `HEAD`s
that ask for HTML, and Vite answers everything else. `routes: ['/api']` sends
everything under `/api` to the app as well, whatever its method and `Accept`
header, before Vite sees it, so `/api/hello` answers in dev as it does in
production. It matches `/api` and `/api/hello`, not `/api.json`; list one
prefix for each your API uses.

## 5. Develop

```bash
vite dev   # http://localhost:5173
```

Every page is rendered by your Koa app and streamed, through `koa-compress`
and any other middleware in front of `page`, and `/api/hello` is answered by
the same app. `import.meta.env.PROD` is `false` there, so `src/server.ts`
neither mounts `koa-static` nor starts a server of its own.

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

`dist/server/server.js` still imports Koa and its middleware, which Vite
leaves out of the bundle, so run it where the app's `node_modules` are, or
install the production dependencies next to `dist/` in your image. Angular is
bundled.

Check that it streams before you put anything in front of it:

```bash
curl -sN -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
```

```text
20:25:40.944026 <= Recv data, 3057 bytes (0xbf1)
20:25:42.949025 <= Recv data, 788 bytes (0x314)
20:25:42.949179 <= Recv data, 19 bytes (0x13)
20:25:42.949415 <= Recv data, 5 bytes (0x5)
```

That's the example: the shell at once, and two seconds later the widget's
chunk, followed by the end of the page and the closing chunk. One line for the
whole page means something buffered it; see
[Checking that a response streams](../guides/streaming-through-proxies.md#checking-that-a-response-streams).

## 7. Compression

`koa-compress` passes the body through a zlib stream, and a zlib stream holds
its output until it has enough to compress well. For a page, that is all of
it. Without the `flush` options, `app.use(compress())` sends the shell
compressed, but only when the last block is done:

```bash
curl -sN --compressed http://localhost:3000/ | perl -MTime::HiRes=time -ne '
  BEGIN { $t0 = time }
  printf "%5d ms  %s\n", (time - $t0) * 1000, $& if /data-placeholder|<template data-ngs="\w+"/'
```

```text
 2010 ms  data-placeholder
 2012 ms  <template data-ngs="d0"
```

With a `flush` for each encoding, as in the server above, zlib flushes after
every write, and each chunk leaves as soon as it is compressed:

```text
    2 ms  data-placeholder
 2008 ms  <template data-ngs="d0"
```

Give every encoding the middleware can pick its flush: `Z_SYNC_FLUSH` for
gzip and deflate, `BROTLI_OPERATION_FLUSH` for Brotli and `ZSTD_e_flush` for
zstd. `koa-compress` 5.3 prefers zstd, and Chrome asks for it, so a missing
zstd flush buffers every page in Chrome while `curl --compressed` may still
stream: curl only asks for the encodings it was built with, often just gzip
and deflate. Check each one with `-H 'Accept-Encoding: zstd'` (or `br`) and
`--trace-ascii`, which shows the compressed pieces as they arrive.

Flushing costs a little compression, and applies to static files as well,
which are read in 64 KB pieces, so it hardly shows there. Or don't compress
pages in Node at all: set `ctx.compress = false` in `page` and leave it to the
proxy in front. See
[Compression middleware](../guides/streaming-through-proxies.md#compression-middleware).

## 8. Behind a proxy

A proxy or a CDN can hold the response back until it is complete, and the
page then arrives all at once. `page` sends `X-Accel-Buffering: no` for Nginx;
for the rest, read
[Streaming through proxies](../guides/streaming-through-proxies.md).

Behind a proxy that rewrites the host or ends TLS, pass
`toWebRequest(ctx.req, ctx.res, { trustProxy: true })` to build the URL from
`X-Forwarded-Host` and `X-Forwarded-Proto`, and list the public host in
`allowedHosts`. Koa's own `app.proxy` only changes what `ctx.host` and
`ctx.protocol` say; the renderer doesn't read those.

## 9. Stream something

<!-- include ../_shared/stream-something.md -->
