This is the setup `apps/example-nestjs` in the repository uses: Angular
compiled by ngp through Vite, and a Nest app on `@nestjs/platform-express`
built into the same server bundle. Its controllers answer under `/api`, and
`AngularStreamModule` renders every other `GET` as a streamed page. It is built
on the [Node adapter](node.md), so most of what that page says holds here too.

On `@nestjs/platform-fastify`, only the server entry, compression and static
files change; [Fastify](#fastify) has those, and `apps/example-nestjs-fastify`
is that setup.

## 1. The browser config

<!-- include ../_shared/browser-config.md -->

## 2. The server config

<!-- include ../_shared/server-config.md -->

## 3. The Nest module

Import `AngularStreamModule` into your root module, next to your controllers:

```ts title="src/app.module.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { Module } from '@nestjs/common';
import { AngularStreamModule } from '@push-based/angular-stream-nestjs';
import { HelloController } from './api/hello.controller';
import { HelloService } from './api/hello.service';
import { App } from './app/app';
import { config } from './app/app.config.server';

@Module({
  imports: [
    AngularStreamModule.forRoot({
      rootComponent: App,
      config,
      eventDispatchContract,
      allowedHosts: ['localhost', 'my-app.example.com'],
      // Relative to the built server, dist/server/server.js.
      template: new URL('./index.server.html', import.meta.url),
      staticDir: new URL('../client/', import.meta.url),
    }),
  ],
  controllers: [HelloController],
  providers: [HelloService],
})
export class AppModule {}
```

The options are the Node adapter's, unchanged; see
[`createNodeHandler()`](../reference/node.md#createnodehandler). The file is
bundled into `dist/server/server.js`, so both URLs are relative to that: the
template is `dist/server/index.server.html`, and `staticDir` is the browser
build in `dist/client`.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.

The controller is an ordinary Nest controller:

```ts title="src/api/hello.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { HelloService } from './hello.service';

@Controller('hello')
export class HelloController {
  constructor(private readonly hello: HelloService) {}

  @Get()
  get(): { message: string } {
    return this.hello.hello();
  }
}
```

When the options come from somewhere else, such as `ConfigService`, use
`AngularStreamModule.forRootAsync({ imports, useFactory, inject })`; see
[the reference](../reference/nestjs.md#angularstreammoduleforrootasync).

## 4. The server entry

```ts title="src/server.ts"
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createRequestListener } from '@push-based/angular-stream-nestjs';
import { AppModule } from './app.module';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix('api');

// `vite dev` imports this module for its default export, and serves it itself.
export default createRequestListener(app);

// In `vite dev`, an edit to the server runs this module again, which creates a
// new app: close the old one, so its `onModuleDestroy` hooks run.
import.meta.hot?.accept();
import.meta.hot?.dispose(() => app.close());

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  console.log(`Listening on http://localhost:${port}`);
}
```

With the global prefix, `/api/hello` is the controller, an unknown `/api/...`
gets Nest's `404` JSON, and every other `GET` and `HEAD` renders the Angular
app. Without a prefix, a controller still answers first and anything no
controller takes is rendered.

`createRequestListener()` turns the app into a `node:http` request listener for
`vite dev`. In production, `app.listen()` starts the server as usual.

## 5. TypeScript

Nest reads constructor types from decorator metadata, so the tsconfig the app
is built with needs both decorator flags:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

ngp compiles the Angular parts of each file and hands the rest on as
TypeScript. Vite's own transform then compiles the Nest decorators, and it
reads both flags from the tsconfig. Without `emitDecoratorMetadata`, Nest
warns at startup that `HelloController` "has no decorator metadata", passes
`undefined` for `HelloService`, and `/api/hello` answers `500`.

`AngularStreamModule` itself is published without decorators, so it works
however your app compiles them.

## 6. Vite

```ts title="vite.config.ts"
import { angularStreamNest } from '@push-based/angular-stream-nestjs/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    angularStreamNest({ entry: 'src/server.ts' }),
    ngp({ ssr: { entry: 'src/server.ts' } }),
  ],
});
```

ngp's `ssr` option builds the browser app into `dist/client` and the server
entry into `dist/server`, next to `index.server.html`. Nest stays out of the
bundle, so Node loads it from `node_modules`.

`angularStreamNest()` is for `vite dev`. It sends each page to the listener
your server entry default-exports, with `index.html` as the dev server
transforms it, and sends it every other request Vite has no file or module for,
so `/api/hello` reaches Nest in dev too. List it before ngp. In a build it does
nothing.

## 7. Develop

```bash
vite dev   # http://localhost:5173
```

Pages stream as they do in production, the API answers, and an edit to a
controller or service is live on the next request. `import.meta.env.PROD` is
`false` there, so `src/server.ts` doesn't call `listen()`.

## 8. Build and run

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

`dist/server/server.js` imports Nest, `reflect-metadata` and the other packages
Vite left out of the bundle, so run it where the app's `node_modules` are, or
install the production dependencies next to `dist/` in your image.

Check that it streams:

```bash
curl -sN -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
```

```text
20:36:36.798526 <= Recv data, 3063 bytes (0xbf7)
20:36:38.800019 <= Recv data, 807 bytes (0x327)
```

That's the example: the shell at once, and the widget's chunk two seconds
later, when its data is there. One line for the whole page means something
buffered it; see
[Checking that a response streams](../guides/streaming-through-proxies.md#checking-that-a-response-streams).

## 9. Static files

`staticDir` serves the browser build from the render route: a file in
`dist/client` is sent from disk, anything else is rendered. A path that
ends in `.html`, in any case, is left to the renderer, so `/index.html` and
`/INDEX.HTML` render too. A missing file under `/assets/`, such as a chunk
from before a deploy, is a `404` rather than a page. Keep `staticDir` unless something else serves the files.

If you'd rather use Express's static middleware, leave `staticDir` out and
register it in `src/server.ts`, before `listen()`:

```ts
app.useStaticAssets(fileURLToPath(new URL('../client/', import.meta.url)), { index: false });
```

`index: false` matters: without it, `/` gets the unrendered `index.html` from
the browser build. `/index.html` itself is still served from disk as it is.

`ServeStaticModule` from `@nestjs/serve-static` answers every `GET` it can't
find a file for with its own `index.html`, which leaves nothing for the Angular
app to render. To use it for the browser build, turn that off:

```ts
imports: [
  ServeStaticModule.forRoot({
    rootPath: fileURLToPath(new URL('../client/', import.meta.url)),
    serveStaticOptions: { index: false },
    exclude: ['/{*any}'], // no index.html fallback
  }),
  AngularStreamModule.forRoot({ /* no staticDir */ }),
],
```

The order of the imports doesn't matter. `AngularStreamModule` adds its render
route last, right before Nest's 404 handler, so `ServeStaticModule`'s files,
`GraphQLModule`'s endpoint and anything else a module adds when the app
initializes are answered first.

This is Express only. On Fastify, `ServeStaticModule` always adds a `GET *`
route, whatever `exclude` says, and Fastify refuses to start with two
catch-all routes (`FST_ERR_DUPLICATED_ROUTE`). Use `staticDir` or
`@fastify/static` there; see [Fastify](#fastify).

## 10. What Nest sees of a page

Pages aren't controller routes. The render route is added after everything
else, so Nest's guards, interceptors and pipes never run for a page, and
neither does anything that could buffer or rewrite it. That has two
consequences to plan for:

- **A global guard doesn't protect pages.** An auth guard registered as
  `APP_GUARD` covers your controllers only; every page stays public.
- **`MiddlewareConsumer` middleware doesn't reach pages.** With a global
  prefix, `consumer.apply(...).forRoutes('*')` is scoped to `/api`.

Middleware added with `app.use()` runs for every request, pages included. Put
anything that has to cover pages there: authentication, sessions,
compression.

Errors go to Nest's exception filters only while nothing has been sent: a
`Host` header that is more than a host and a port is a `BadRequestException`
(`400`). A render that fails before its first byte is retried as a buffered
render, and only if that fails too does the error reach the filters, as a
`500`. Once the shell has gone out, an error is the renderer's: it logs it and
cuts the connection, so the browser keeps what it has and no filter writes a
JSON body into the page.

## 11. Behind a proxy

A proxy, a CDN or compression middleware can hold the response back until it
is complete. Pages carry `X-Accel-Buffering: no` for Nginx, and `compression`
added with `app.use(compression())` is flushed after each chunk; for the rest,
read [Streaming through proxies](../guides/streaming-through-proxies.md).
Behind a proxy that rewrites the host, set
[`trustProxy`](../reference/node.md#createnodehandler).

## 12. Stream something

<!-- include ../_shared/stream-something.md -->

## Fastify

The same module renders pages on `@nestjs/platform-fastify`, with the same
options and the same results: the API keeps `/api`, an unknown `/api/...`
gets Nest's `404`, a missing file under `/assets/` is a `404`, and a bad
`Host` is a `400`. Every step but static files (step 9) stays the same.
Install the Nest adapter, the stream's Fastify adapter, which the module loads
only on Fastify, and `@fastify/compress` if you compress in Node:

```bash
npm install @nestjs/platform-fastify @push-based/angular-stream-fastify@next @fastify/compress
```

### The server entry

```ts title="src/server.ts"
import 'reflect-metadata';
import fastifyCompress from '@fastify/compress';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createRequestListener } from '@push-based/angular-stream-nestjs';
import { AppModule } from './app.module';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
app.setGlobalPrefix('api');

// Before the app initializes, so it applies to the controllers and the pages.
await app.register(fastifyCompress, { flushOnIdle: true });

// `vite dev` imports this module for its default export, and serves it itself.
export default createRequestListener(app);

import.meta.hot?.accept();
import.meta.hot?.dispose(() => app.close());

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  console.log(`Listening on http://localhost:${port}`);
}
```

`createRequestListener()` tells the two platforms apart. On Fastify, the first
request in `vite dev` initializes the app, starts the Fastify instance
(`ready()`), and from then on hands each request to Fastify's router.

On Fastify, `AngularStreamModule` adds a route, `GET` and `HEAD` on `/*`,
rather than middleware. Fastify answers a URL with its most specific route,
so a controller, or a route another module adds, answers first, whichever
order they were added in. The page route is built on the Fastify adapter's
[`createFastifyHandler()`](../reference/fastify.md#createfastifyhandler): the
page goes out through `reply.send()`, so `onSend` hooks still see it.

### Compression

Register `@fastify/compress` with `flushOnIdle: true`, before `app.listen()`.
Without `flushOnIdle`, the compressed page arrives in one piece once the
render is done. Check it with `curl --compressed`:

```bash
curl -sN --compressed -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
```

```text
21:15:36.928001 <= Recv data, 1516 bytes (0x5ec)
21:15:38.932440 <= Recv data, 393 bytes (0x189)
```

To leave pages uncompressed, and compress in a proxy in front, leave
`@fastify/compress` out. See
[`@fastify/compress`](../reference/fastify.md#fastifycompress) for the details.

### Static files

`staticDir` works as on Express. A file from it is written straight to the
socket (`reply.hijack()`), so `@fastify/compress` doesn't compress it, and
headers that Fastify hooks set with `reply.header()` aren't sent with it.
Headers that `app.use()` middleware sets are.

To compress the browser build too, leave `staticDir` out, install
`@fastify/static` (`npm install @fastify/static`), and register it in
`src/server.ts`:

```ts
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';

await app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../client/', import.meta.url)),
  wildcard: false,
  globIgnore: ['**/*.html'],
});
```

- **`wildcard: false`**: by default, `@fastify/static` adds a `GET /*` route
  of its own, and the app fails to start with `FST_ERR_DUPLICATED_ROUTE`.
- **`globIgnore: ['**/*.html']`**: without it, `/` and `/index.html` answer
  with the browser build's unrendered `index.html`.

`app.useStaticAssets()` registers the same plugin, but Nest's type for its
options has no `globIgnore`. Either way, a missing file under `/assets/` is
still a `404`.

### What Fastify sees of a page

As on Express, guards, interceptors and pipes don't run for pages. Middleware
added with `app.use()` and Fastify's own `onRequest` hooks do, so put anything
that has to cover pages there.
