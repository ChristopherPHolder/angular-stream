This is the setup `apps/example-node` in the repository uses: Angular compiled
by ngp through Vite, the server bundle run by Node with plain `node:http`, the
browser build served from disk by the same handler, and every other request
rendered as a streamed page. The handler is also Connect and Express
middleware, so the same steps hold for a server built on those.

## Before you start

<!-- include ../_shared/before-you-start.md -->

## 1. Install

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-node@next
npm install -D @types/node
```

## 2. The browser config

<!-- include ../_shared/browser-config.md -->

## 3. The server config

<!-- include ../_shared/server-config.md -->

## 4. The server

```ts title="src/server.ts"
import { createServer } from 'node:http';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createNodeHandler } from '@push-based/angular-ssr-stream-node';
import { App } from './app/app';
import { config } from './app/app.config.server';

const handler = createNodeHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  template: new URL('./index.server.html', import.meta.url),
  staticDir: new URL('../client/', import.meta.url),
});

// `vite dev` imports this module for its default export, and serves it itself.
export default handler;

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  createServer(handler).listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
```

The file is built to `dist/server/server.js`, so both URLs are relative to
that: the template is `dist/server/index.server.html`, and `staticDir` is the
browser build in `dist/client`.

<!-- include ../_shared/allowed-hosts.md -->

<!-- include ../_shared/event-replay.md -->

Behind a proxy that rewrites the host, see
[`trustProxy`](../reference/node.md#createnodehandler). A `Host` header that
can't be parsed at all is answered with `400`, before the check.

`staticDir` serves the browser build's files: scripts, styles, icons. A
request for anything else, `/` and `/index.html` included, is rendered as a
page. Leave `staticDir` out when something in front already serves the files,
such as `express.static`, Nginx or a CDN.

With Connect or Express, use the handler as middleware: `app.use(handler)`.
It renders every `GET` and `HEAD` that reaches it as a page, so mount the
routes that answer those, such as an API, before it. Other methods are passed
on to `next()`, and so is an error, for the app's error handler. Default-export
the app rather than the handler then; see
[What the server entry default-exports](../reference/node.md#what-the-server-entry-default-exports).
The whole Express setup, with `express.static()`, API routes and
`compression`, is on [Express](express.md).

## 5. Vite

```ts title="vite.config.ts"
import { angularStreamNode } from '@push-based/angular-ssr-stream-node/vite';
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

`angularStreamNode()` is for `vite dev`. It sends each page request to the
handler your server entry default-exports, with `index.html` as the dev server
transforms it, so the page loads Vite's client and your sources, and SSR
streams as it does in production. List it before ngp, or the dev server
refuses to start: ngp's own dev SSR would otherwise answer page requests first,
and call the handler the wrong way. In a build the plugin does nothing.

## 6. Develop

```bash
vite dev   # http://localhost:5173
```

The dev server serves the sources, and every page is rendered by your handler
and streamed. `import.meta.env.PROD` is `false` there, so `src/server.ts`
doesn't start a server of its own.

## 7. Build and run

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
bundle, so run it where the app's `node_modules` are, or install the
production dependencies next to `dist/` in your image. Angular is bundled.

## 8. Check that it streams

Before you put anything in front of the server:

<!-- include ../_shared/check-it-streams.md url=http://localhost:3000/ -->

## 9. Behind a proxy

A proxy, a CDN or compression middleware can hold the response back until it
is complete, and the page then arrives all at once. The handler sends
`X-Accel-Buffering: no` for Nginx, and calls `res.flush()` after each chunk for
`compression`; for the rest, read
[Streaming through proxies](../guides/streaming-through-proxies.md).

## 10. Stream something

<!-- include ../_shared/stream-something.md -->
