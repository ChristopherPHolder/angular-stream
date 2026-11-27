This is the setup `apps/example-nestjs` in the repository uses: Angular
compiled by ngp through Vite, and a Nest app on `@nestjs/platform-express`
built into the same server bundle. Its controllers answer under `/api`, and
`AngularStreamModule` renders every other `GET` as a streamed page. It is built
on the [Node adapter](node.md), so most of what that page says holds here too.

Only `@nestjs/platform-express` is supported for now; see
[Fastify](#fastify).

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
`dist/client` is sent from disk, anything else is rendered. `.html` files are
never served as files, so `/index.html` renders too. Keep it unless something
else serves the files.

If you'd rather use Express's static middleware, leave `staticDir` out and
register it in `src/server.ts`, before `listen()`:

```ts
app.useStaticAssets(fileURLToPath(new URL('../client/', import.meta.url)), { index: false });
```

`index: false` matters: without it, `/` gets the unrendered `index.html` from
the browser build. `/index.html` itself is still served from disk as it is.

`ServeStaticModule` from `@nestjs/serve-static` answers every `GET` it can't
find a file for with its own `index.html`, which leaves nothing for the Angular
app to render. To use it for the browser build, turn that off, and import it
before `AngularStreamModule`, so its files are served before pages are
rendered:

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

Imported after it, its files are never reached: the script and stylesheet
requests are rendered as pages.

## 10. What Nest sees of a page

Pages aren't controller routes. The render route is added after your
controllers, so Nest's guards, interceptors and pipes never run for a page, and
neither does anything that could buffer or rewrite it. Middleware added with
`app.use()` runs for pages as it does for everything else.

Errors go to Nest's exception filters only while nothing has been sent: a
`Host` header that is more than a host and a port is a `BadRequestException`
(`400`), and a render that fails before its first byte is a `500`. Once the
shell has gone out, an error is the renderer's: it logs it and cuts the
connection, so the browser keeps what it has and no filter writes a JSON body
into the page.

## 11. Behind a proxy

A proxy, a CDN or compression middleware can hold the response back until it
is complete. Pages carry `X-Accel-Buffering: no` for Nginx, and `compression`
added with `app.use(compression())` is flushed after each chunk; for the rest,
read [Streaming through proxies](../guides/streaming-through-proxies.md).
Behind a proxy that rewrites the host, set
[`trustProxy`](../reference/node.md#createnodehandler).

## 12. Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).

## Fastify

`@nestjs/platform-fastify` isn't supported yet: on it, `AngularStreamModule`
throws when the app starts. Support will build on the Fastify plugin,
`@push-based/angular-stream-fastify`.
