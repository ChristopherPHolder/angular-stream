Bun's server speaks web `Request` and `Response`, so it needs no adapter:
`Bun.serve()` hands each request to the core's `createStreamingHandler()` and
sends the streamed `Response` it gets back as it is. Angular is still compiled
by ngp through Vite, which builds the browser bundle and a server bundle; Bun
only runs the result.

This is the setup of
[`apps/example-bun`](../../../../../apps/example-bun/src/server.ts), checked
with Bun 1.4.5.

## 1. Install

```bash
bun add @push-based/angular-stream-core@next
```

The core is all a Bun server needs. Vite and ngp still need Node 26 for the
build; see [Installation](installation.md).

## 2. The browser config

<!-- include ../_shared/browser-config.md -->

## 3. The server config

<!-- include ../_shared/server-config.md -->

## 4. The server

```ts title="src/server.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { App } from './app/app';
import { config } from './app/app.config.server';

/** The browser build. This file is built to dist/server/server.js, next to it. */
const client = `${import.meta.dir}/../client`;

/** The built `index.html`, read once: every page is rendered into it. */
const template = await Bun.file(`${client}/index.html`).text();

const handle = createStreamingHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  loadTemplate: async () => new Response(template),
});

/**
 * Every built file but the template, each as its own route, so it's served
 * before the renderer. Route keys are URL paths, so file names are encoded.
 * `/assets/*` catches a hashed file that no longer exists (an old chunk after
 * a deploy) with a 404, instead of rendering a page in its place.
 */
const routes: Record<string, Bun.BunFile | Response> = {
  '/assets/*': new Response('Not found', { status: 404 }),
};
for await (const path of new Bun.Glob('**/*').scan({ cwd: client, dot: true })) {
  if (path !== 'index.html') {
    routes[encodeURI(`/${path}`)] = Bun.file(`${client}/${path}`);
  }
}

const server = Bun.serve({
  port: Number(process.env['PORT'] ?? 3000),
  routes,
  // Every other request is a page.
  fetch: (request) => handle(request),
});

console.log(`Listening on ${server.url}`);
```

`dist/client/index.html` is the template, not a page. It is read once, at
startup, and every page request is rendered into a copy of it.

The static files go in `routes`, one route per file found in `dist/client` at
startup, and Bun matches those before it calls `fetch`. So `/assets/*` and
`/favicon.ico` are served from disk, and anything else, `/` included, falls
through to the renderer. A path that isn't a built file never reaches the
disk, so there's nothing to guard against `..` in it.
A missing file under `/assets/`, such as an old hashed chunk after a deploy,
gets a `404` rather than a page.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.

`eventDispatchContract` is for `withEventReplay()`. The built `index.html`
doesn't carry the script Angular needs to queue the clicks made before the
page hydrates, so the handler adds it. Leave it out and those clicks are lost.

For the types of `Bun`, add `@types/bun` to the app's devDependencies and
`"bun"` to `types` in `tsconfig.app.json`.

## 5. Vite

```ts title="vite.config.ts"
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  // `vite build` builds every environment, not only the client.
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      // Every dependency bundled, so dist/ is all a server needs: no node_modules.
      resolve: { noExternal: true },
      build: { outDir: 'dist/server', rolldownOptions: { input: 'src/server.ts' } },
    },
  },
  plugins: [ngp({ entries: ['src/main.ts', 'src/server.ts'] })],
});
```

The `ssr` environment builds `src/server.ts`, and ngp compiles it, and the
components it imports, with its server compiler. ngp's own `ssr` option stays
off: it expects a `render(url, document)` function that returns the whole page
as a string, which is the buffered render this server avoids.

`resolve.noExternal: true` bundles every dependency into the server build, so
`dist/` runs on its own, without `node_modules`.

## 6. Build and run

```bash
vite build                   # client to dist/client, server to dist/server
bun dist/server/server.js    # http://localhost:3000
```

The build runs on Node; Bun is only needed to run the result. For production,
ship `dist/` and run the same command, with `PORT` set if 3000 isn't the port.

To check that it streams, request a page with `curl -N` and note when each part
arrives. For the example, the shell (with the widget's placeholder) comes at
once and the widget's `<template data-ngs>` chunk 2 seconds later. Bun writes
each chunk of the `ReadableStream` body as it is enqueued, with nothing to
configure. A response that arrives all at once means something in front of Bun
buffered it.

## 7. Development

`vite dev` doesn't run `src/server.ts`: it serves `index.html` as it is, and
Angular renders the app in the browser, with HMR but without the stream, and
with a console warning (NG0505) that there was nothing to hydrate. To see the
stream, build and run it with Bun as above.

`vite build --watch` with `bun --watch dist/server/server.js` doesn't work
either: each rebuild empties `dist/server`, and Bun restarts while the file is
missing and stops with `Module not found`.

## Elysia

[Elysia](https://elysiajs.com/) runs on Bun and passes the `Request` through
the same way: a handler that returns a `Response` has it sent as it is,
streamed. The template, the config and the build stay the same; only the end
of `src/server.ts` changes:

```ts title="src/server.ts"
import { staticPlugin } from '@elysiajs/static';
import { Elysia } from 'elysia';

// …the template and `handle`, as above.

new Elysia()
  .use(staticPlugin({ assets: 'dist/client', prefix: '/', alwaysStatic: true, indexHTML: false }))
  .get('/*', ({ request }) => handle(request))
  .listen(Number(process.env['PORT'] ?? 3000));
```

`alwaysStatic: true` gives each built file a route of its own, the way
`routes` does above. Without it the plugin mounts a wildcard of its own: `/`
answers `404`, and the app's `/*` route answers every static file with the
page. The plugin turns it on by itself only when `NODE_ENV` is `production`,
and turns it off again past `staticLimit` (1024 files), so set both
explicitly if the build has more files than that. `assets` is relative to the working directory, so start the
server from the app's folder.

Unlike the `Bun.serve()` version above, this serves `/index.html` itself as a
plain file. Checked with Elysia 1.4.32 and `@elysiajs/static` 1.4.12.

## Stream something

<!-- include ../_shared/stream-something.md -->
