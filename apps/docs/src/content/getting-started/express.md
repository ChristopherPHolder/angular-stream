Express middleware has the shape of a Node request handler, `(req, res, next)`,
so Express needs no adapter of its own: the handler from
[`@push-based/angular-ssr-stream-node`](../reference/node.md) is mounted as the
app's catch-all, after the browser build and the API routes, with
`compression` in front of all of them. This is the setup
[`apps/example-express`](../../../../../apps/example-express/src/server.ts) in
the repository uses, on Express 5.

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-node@next express compression
npm install -D @types/express @types/compression
```

## 1. The browser config

<!-- include ../_shared/browser-config.md -->

## 2. The server config

<!-- include ../_shared/server-config.md -->

## 3. The server

```ts title="src/server.ts"
import { fileURLToPath } from 'node:url';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createNodeHandler } from '@push-based/angular-ssr-stream-node';
import compression from 'compression';
import express from 'express';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * The Express server entry. Built to dist/server/server.js, next to the
 * template (dist/server/index.server.html) and one folder away from the
 * browser build (dist/client), which is where these URLs point.
 */
const handler = createNodeHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  template: new URL('./index.server.html', import.meta.url),
  // No `staticDir`: `express.static()` serves the browser build.
});

const client = fileURLToPath(new URL('../client/', import.meta.url));

const app = express();
app.disable('x-powered-by');

// First, so that it wraps every response after it. The handler calls
// `res.flush()` after each chunk, so pages still stream.
app.use(compression());

// The browser build. Vite names the files in `assets/` by their content hash.
// `index: false`: `/` is a page, rendered by the handler, not the built index.html.
// `/index.html` is the template, so it's a page too, never served as the raw file.
app.get('/index.html', handler);
app.use('/assets', express.static(`${client}assets`, { immutable: true, maxAge: '1y' }));
// A hashed file that no longer exists (an old chunk after a deploy) is a 404, not a page.
app.use('/assets', (_req, res) => {
  res.sendStatus(404);
});
app.use(express.static(client, { index: false }));

// Before the handler, which renders every `GET` that reaches it as a page.
app.get('/api/hello', (_req, res) => {
  res.json({ hello: 'from Express' });
});
app.use('/api', (_req, res) => {
  res.sendStatus(404);
});

// Everything else is a page.
app.get('/{*splat}', handler);

// Last: errors the handler passes on, such as a bad `Host` (400), answered with
// their status and a plain message instead of Express's default page, which
// shows the stack trace whenever NODE_ENV isn't `production`.
app.use(
  (
    error: { status?: number },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = error.status ?? 500;
    res
      .status(status)
      .type('text/plain')
      .send(status === 400 ? 'Bad request' : 'Server error');
  },
);

// `vite dev` imports this module for its default export, and serves it itself.
export default app;

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
```

The file is built to `dist/server/server.js`, so both URLs are relative to
that: the template is `dist/server/index.server.html`, and the browser build
is `dist/client`.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.
Behind a proxy that rewrites the host, see
[`trustProxy`](../reference/node.md#createnodehandler).

`eventDispatchContract` is for `withEventReplay()`. The handler adds it to the
template unless it's there already, so a click made before the page hydrates is
queued and replayed.

The module default-exports the Express app, not the handler: in dev, the Vite
plugin calls that export for each page, so pages go through the same
middleware as in production. See
[What the server entry default-exports](../reference/node.md#what-the-server-entry-default-exports).

### The order of the middleware

Express runs middleware in the order it is added, and the handler answers
every `GET` and `HEAD` that reaches it. So, from first to last:

1. **`compression()`**, before anything that writes a response. It wraps
   `res`, and only compresses what is written after it. Mounted after the
   handler, pages aren't compressed at all.
2. **`express.static()`**, for the browser build. It answers the files that
   exist and passes every other request on. Give it `index: false`:
   otherwise it answers `/` with `dist/client/index.html`, the built page
   without anything rendered into it, and `/` never streams. `/index.html`
   gets the handler before `express.static()` sees it, so it's a page too.
   A missing file under `/assets/`, such as an old hashed chunk after a
   deploy, gets a `404` rather than a page.
3. **API routes**, and anything else that answers a `GET`. Mounted after the
   handler, they are never reached: their URLs are rendered as pages. The
   `app.use('/api', …)` after them answers `404` for an API URL that doesn't
   exist, which would otherwise be rendered as a page too.
4. **The handler**, last, as the catch-all. In Express 5, a path that matches
   everything is `/{*splat}`; `'*'` throws when the app starts.
   `app.use(handler)` works as well: the handler passes methods other than
   `GET` and `HEAD` on to `next()`, which ends in Express's `404`.

An error in the handler is passed to `next()`, and the error-handling
middleware at the end answers it with its status (`400` for a bad `Host`) and
a plain message. Without it, Express's default error page shows the stack
trace whenever `NODE_ENV` isn't `production`. An error after the
first byte can't change the response any more: the handler cuts the
connection, and the error doesn't reach `next()`.

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
Express app, with `index.html` as the dev server transforms it, so the page
loads Vite's client and your sources, and SSR streams as it does in
production. List it before ngp, or the dev server refuses to start.

On its own, it sends the app pages only: requests that accept HTML and that
Vite doesn't serve itself. A request to the API doesn't accept HTML, and Vite
would answer it with `index.html`. `routes` sends everything under `/api` to
the Express app as well, whatever its method and `Accept` header, before Vite
sees it, so the API answers in dev as it does in production. `'/api'` matches
`/api` and `/api/hello`, not `/api.json`; list one prefix for each your API
routes use. In a build the plugin does nothing.

## 5. Develop

```bash
vite dev   # http://localhost:5173
```

The dev server serves the sources and the files in `public/`, so
`express.static()` has nothing to do there. `import.meta.env.PROD` is `false`,
so `src/server.ts` doesn't start a server of its own.

In dev, Express sees a page request with the URL Vite rewrote it to,
`/index.html`; `req.originalUrl` holds the one the browser asked for, and that
is what the handler renders. A request under `/api` keeps its URL: the plugin
hands it over before Vite rewrites anything. The catch-all matches either, but
a route that picks pages by their path, such as `app.get('/admin',
requireLogin)`, only matches in production. Middleware that has to run for some pages in dev too
can be mounted without a path and read `req.originalUrl`.

## 6. Build and run

```json title="package.json"
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "NODE_ENV=production node dist/server/server.js"
  }
}
```

```bash
vite build                      # client to dist/client, server to dist/server
NODE_ENV=production node dist/server/server.js      # http://localhost:3000, or $PORT
```

`dist/server/server.js` imports Express, `compression` and the other packages
Vite left out of the bundle, so run it where the app's `node_modules` are, or
install the production dependencies next to `dist/` in your image. Angular is
bundled.

## 7. Check that it streams, compressed

Ask for the page the way a browser does, compressed, and time when the shell
and the widget arrive:

```bash
curl -sN --compressed http://localhost:3000/ | perl -MTime::HiRes=time -ne '
  BEGIN { $t0 = time }
  printf "%5d ms  %s\n", (time - $t0) * 1000, $& if /data-placeholder|<template data-ngs="\w+"/'
```

```text
    2 ms  data-placeholder
 2011 ms  <template data-ngs="d0"
```

That's the example: the shell at once, and the widget's chunk two seconds
later, when its data is there, both gzipped. Per read from the socket:

```bash
curl -sN --compressed -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
```

```text
20:26:17.976548 <= Recv data, 1503 bytes (0x5df)
20:26:19.983858 <= Recv data, 472 bytes (0x1d8)
20:26:19.983992 <= Recv data, 30 bytes (0x1e)
20:26:19.984200 <= Recv data, 5 bytes (0x5)
```

`compression` holds what it has compressed until it has enough to send, and
for a page that is all of it. It adds `res.flush()` to send what it has
so far, and the handler calls that after every chunk; that is the whole setup.
It works the same for `gzip`, `deflate` and `br`, whichever the browser asks
for.

When nothing flushes, the response looks like this instead: the plain request
still streams, and the compressed one arrives in one piece, at the end.

```text
 2004 ms  data-placeholder
 2005 ms  <template data-ngs="d0"
```

```text
20:23:52.251394 <= Recv data, 15 bytes (0xf)
20:23:54.256175 <= Recv data, 1858 bytes (0x742)
```

The page still renders, so nothing reports it, which is why the check above
uses `--compressed`. Two ways to get there:

- **A compressor that doesn't add `res.flush()`**, or that has to be told to
  flush, in place of `compression`. Flush after each write, or leave HTML out
  of it; see
  [Compression middleware](../guides/streaming-through-proxies.md#compression-middleware).
- **Writing the `Response` yourself** in place of `createNodeHandler()`, for
  instance with `Readable.fromWeb(response.body).pipe(res)`, which never
  calls `res.flush()`. Use
  [`sendWebResponse()`](../reference/node.md#sendwebresponse), which does.

To keep pages out of `compression` and still compress everything else, give
it a `filter`:

```ts
app.use(
  compression({
    filter: (req, res) =>
      !String(res.getHeader('Content-Type')).startsWith('text/html') &&
      compression.filter(req, res),
  }),
);
```

## 8. Behind a proxy

A proxy or a CDN in front of Express can hold the response back as well. The
handler sends `X-Accel-Buffering: no` for Nginx; for the rest, read
[Streaming through proxies](../guides/streaming-through-proxies.md), and run
the check above against each hop.

## 9. Stream something

<!-- include ../_shared/stream-something.md -->
