```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-nestjs@next
```

The NestJS module, for `@nestjs/platform-express` and
`@nestjs/platform-fastify`. It is built on the [Node adapter](node.md), and on
Fastify on the [Fastify adapter](fastify.md)'s route handler. It depends on
[`@push-based/angular-ssr-stream-core`](core.md), whose browser providers the app
still needs. It needs `@nestjs/common` and `@nestjs/core` 12, and one of
`@nestjs/platform-express` and `@nestjs/platform-fastify` 12. On Fastify,
install `@push-based/angular-ssr-stream-fastify` too: it's an optional peer, loaded
only there, so an Express app installs nothing from Fastify. For the whole
setup, see [NestJS](../getting-started/nestjs.md).

Two entry points: `@push-based/angular-ssr-stream-nestjs` for the server, and
`@push-based/angular-ssr-stream-nestjs/vite` for the dev server.

## `AngularStreamModule.forRoot()`

```ts
class AngularStreamModule {
  static forRoot(options: AngularStreamModuleOptions): DynamicModule;
  static forRootAsync(
    options: ConfigurableModuleAsyncOptions<AngularStreamModuleOptions, 'create'>,
  ): DynamicModule;
}

/** The Node adapter's options, unchanged. */
type AngularStreamModuleOptions = NodeHandlerOptions;
```

Renders the Angular application for every `GET` and `HEAD` that no controller
answers. The options are those of
[`createNodeHandler()`](node.md#createnodehandler): `rootComponent`, `config`,
`allowedHosts`, `eventDispatchContract`, `template`, `staticDir` and
`trustProxy`.

```ts
@Module({
  imports: [
    AngularStreamModule.forRoot({
      rootComponent: App,
      config,
      eventDispatchContract,
      allowedHosts: ['localhost', 'my-app.example.com'],
      template: new URL('./index.server.html', import.meta.url),
      staticDir: new URL('../client/', import.meta.url),
    }),
  ],
  controllers: [HelloController],
})
export class AppModule {}
```

When the app initializes, the module adds its render route last: right
before Nest's own 404 and error handlers. On Express, that is one middleware;
on Fastify, a route with the same steps (see [On Fastify](#on-fastify)). That
is after the controllers' routes, and after whatever other modules add when
they initialize (`GraphQLModule`, and `ServeStaticModule` on Express),
whichever order Nest runs their `onModuleInit` hooks in. On Fastify, another
catch-all `/*` route can't be added at all: Fastify refuses duplicate routes. For each request that reaches it, in
order:

1. Under the global prefix (`app.setGlobalPrefix('api')`), the request is
   passed on, so an unknown `/api/...` gets Nest's `404`. The prefix is matched
   by whole path segments: `/apiary` is a page.
2. A method other than `GET` and `HEAD` is passed on, and ends in a 404
   unless something after the module takes it.
3. Under `/assets/`, a file in `staticDir` is served from disk, and anything
   else is a `404`, not a page: Vite names those files by their content hash,
   so a missing one is an old or mistyped URL, such as a chunk from before a
   deploy. With `staticDir`, the Node adapter's static handler answers it
   (`Not found`, in plain text); without it, the module throws a
   `NotFoundException`, which Nest's filters answer.
4. With `staticDir`, any other file in it is served from disk. A path that
   ends in `.html`, in any case, is left to the renderer, so `/`,
   `/index.html` and `/INDEX.HTML` render.
5. Everything else is rendered as a streamed page.

A controller, or a route or middleware another module adds, always answers
first, wherever it is mounted: pages are only what is left.

### On Fastify

On `@nestjs/platform-fastify`, the render route is a Fastify route, `GET` and
`HEAD` on `/*`, which Fastify picks only when no more specific route matches
the URL. A controller's route, or one another module adds, wins whichever
order they were added in. The module adds the route from a plugin that
Fastify loads when the app starts, after every plugin registered before it,
so `@fastify/compress` applies to pages even when its registration wasn't
awaited. The plugin isn't encapsulated, so the route has Nest's own 404 and
error handlers.

The steps are the ones above, with Fastify's means:

- Under the global prefix, and for a missing file under `/assets/` without
  `staticDir`, the route calls `reply.callNotFound()`, which is Nest's `404`.
  With `staticDir`, the static handler answers a missing asset, as above.
- A method other than `GET` and `HEAD` has no route, and gets Nest's `404`.
- A file in `staticDir` is written to the socket by the Node adapter's static
  handler, and the reply is hijacked: `onSend` hooks (so
  `@fastify/compress`) don't run for it, and headers set with
  `reply.header()` aren't sent with it. Register `@fastify/static` with
  `wildcard: false` and `globIgnore: ['**/*.html']` instead to compress the
  files; see
  [Static files](../getting-started/nestjs.md#static-files).
- A page is rendered by the Fastify adapter's
  [`createFastifyHandler()`](fastify.md#createfastifyhandler): the status and
  headers go on the reply, and the body through `reply.send()` as a stream, so
  `onSend` hooks see it and Fastify logs the request as usual.

Middleware added with `app.use()` and Fastify `onRequest` hooks run for
pages; guards, interceptors and pipes don't, as on Express.

### What runs for a page

Pages aren't controller routes, so Nest's guards, interceptors and pipes don't
run for them:

- **Guards**: an auth guard registered as `APP_GUARD` protects the
  controllers only. Every page stays public.
- **`MiddlewareConsumer`**: middleware applied in a module's `configure()`
  doesn't run for pages when the app has a global prefix, since
  `forRoutes('*')` is then scoped to the prefix. Without a prefix,
  `forRoutes('*')` reaches pages too, but `forRoutes(SomeController)` never
  does.
- **`app.use()`**: middleware added there runs for every request, pages
  included, since Express runs it before any route, and Fastify in an
  `onRequest` hook.

Anything that must cover pages, such as authentication, sessions or
compression, belongs in `app.use()`.

Exception filters see a page only when it fails before anything has been
sent, as below.

### Errors

Before the response has started, an error goes to Nest's exception filters,
global filters included:

- A `Host` that is more than a host name and a port is a
  `BadRequestException` (`400`), from the Node adapter's
  [`BadRequestError`](node.md#badrequesterror).
- A host that isn't in `allowedHosts` gets `403` from the renderer, not an
  exception.
- A render that fails before its first byte falls back to a buffered render;
  if that fails too, the error reaches the filters as a `500`.

Once the shell has been sent, nothing goes back to Nest. An error is logged
(`[ssr] streaming render failed after commit`) and the connection is cut
without the closing chunk, so the client sees a broken response rather than a
complete one, and no filter writes into it. That holds on both platforms.

## `AngularStreamModule.forRootAsync()`

```ts
import type { ConfigurableModuleAsyncOptions } from '@nestjs/common';

// What it comes to, with Options = AngularStreamModuleOptions:
interface ConfigurableModuleAsyncOptions<Options, 'create'> {
  imports?: ModuleMetadata['imports'];
  useFactory?: (...args: any[]) => Options | Promise<Options>;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  useClass?: Type<{ create(): Options | Promise<Options> }>;
  useExisting?: Type<{ create(): Options | Promise<Options> }>;
  provideInjectionTokensFrom?: Provider[];
}
```

The same module, with the options from a provider, as Nest's
`ConfigurableModuleBuilder` defines it. The type is Nest's own, from
`@nestjs/common`; this package exports no name for it.

```ts
AngularStreamModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    rootComponent: App,
    config: serverConfig,
    allowedHosts: config.getOrThrow<string>('ALLOWED_HOSTS').split(','),
    template: new URL('./index.server.html', import.meta.url),
    staticDir: new URL('../client/', import.meta.url),
  }),
}),
```

The options are read once, when the module initializes.

## `ANGULAR_STREAM_OPTIONS`

```ts
const ANGULAR_STREAM_OPTIONS: string | symbol;
```

The injection token the module's options are provided under, whether they came
from `forRoot()` or `forRootAsync()`:

```ts
constructor(@Inject(ANGULAR_STREAM_OPTIONS) options: AngularStreamModuleOptions) {}
```

## `createRequestListener()`

```ts
function createRequestListener(app: INestApplication): NodeHandler;
```

A `node:http` request listener, `(req, res, next?)`, that hands each request
to the app's Express instance, or to the Fastify instance's router: the server
entry's default export, for [`angularStreamNest()`](#angularstreamnest) to
call in `vite dev`.

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix('api');

export default createRequestListener(app);

if (import.meta.env.PROD) {
  await app.listen(3000);
}
```

The first request calls `app.init()`, which registers the routes and the
render route, and on Fastify then starts the instance with `ready()`;
`app.listen()` does the same in production, and only once. Fastify answers
every request itself, a `404` included, so `next` is never called there. Vite
rewrites a page request's URL to `/index.html` before it reaches the listener,
so the listener puts back `req.originalUrl`, the URL that was asked for, for
Nest to route.

## `angularStreamNest()`

```ts
import { angularStreamNest } from '@push-based/angular-ssr-stream-nestjs/vite';

function angularStreamNest(options?: AngularStreamNestOptions): Plugin[];

/** angularStreamNode()'s options, unchanged. */
interface AngularStreamNestOptions {
  /** The server entry, relative to Vite's root. Default: 'src/server.ts'. */
  entry?: string;
  /** The template, relative to Vite's root. Default: 'index.html'. */
  template?: string;
  /** Requests for the server entry before Vite sees them: path prefixes, or a function. Default: none. */
  routes?: readonly string[] | ((pathname: string, req: IncomingMessage) => boolean);
}
```

The Vite plugins for `vite dev`:
[`angularStreamNode()`](node.md#angularstreamnode), which streams each page
through the server entry's default export with the dev template, and a
middleware after it that sends that same export every other request Vite has
no file or module for. Without the second, `vite dev` answers `/api/...` with
its own 404. That middleware gives a `GET` or `HEAD` the dev template too, so
a page fetched without `Accept: text/html` (`curl`, `fetch()`, a link checker)
renders as it does in production. List it before ngp. In a build it does
nothing.

In dev, an edit to the server runs the entry again, which creates a new Nest
app. To close the old one, so its `onModuleDestroy` hooks run, accept the
update in the entry and close the app when it is disposed:

```ts
import.meta.hot?.accept();
import.meta.hot?.dispose(() => app.close());
```

## Static files

Three ways to serve the browser build, `dist/client`:

- **`staticDir`**: served by the render route, after the controllers.
  Paths ending in `.html` are left to the renderer, so `/` and `/index.html`
  both render. This is the one to use unless something else serves the files.
- **`app.useStaticAssets(dir, { index: false })`**: Express's static
  middleware, registered when it is called, before every route. Leave
  `staticDir` out. Without `index: false`, `/` gets the browser build's
  unrendered `index.html`; `/index.html` gets it either way.
- **`ServeStaticModule`** from `@nestjs/serve-static`: by default it answers
  every `GET` that isn't a file with `index.html`, so nothing is rendered. Turn
  that off with `exclude: ['/{*any}']` and pass
  `serveStaticOptions: { index: false }`. Where it is imported doesn't matter:
  its middleware always comes before the render route. Express only: on
  Fastify it always adds a `GET *` route, and the app fails to start with
  `FST_ERR_DUPLICATED_ROUTE`.

In each case a missing file under `/assets/` is a `404`.

On Fastify, `staticDir` works the same, but files from it skip
`@fastify/compress` (see [On Fastify](#on-fastify)). The alternative is
`@fastify/static`, registered with `wildcard: false`, since its default
`GET /*` route makes the app fail to start (`FST_ERR_DUPLICATED_ROUTE`), and
`globIgnore: ['**/*.html']`, so that `/` and `/index.html` render. Nest's
`app.useStaticAssets()` registers the same plugin, though its options type
lacks `globIgnore`.

## Decorators

The package is published without decorators: the module is a
`ConfigurableModuleBuilder` class, and its one provider a factory. It works
whatever compiles the app's own decorators. The app's controllers and
services need `experimentalDecorators` and `emitDecoratorMetadata`, which
Vite's transform reads from the tsconfig; see
[TypeScript](../getting-started/nestjs.md#5-typescript).

## Other platforms

On an HTTP adapter other than Express and Fastify, the module throws when the
app initializes:

```text
[angular-ssr-stream] AngularStreamModule renders pages on @nestjs/platform-express or @nestjs/platform-fastify; this application runs on '<type>'.
```

An application context (`NestFactory.createApplicationContext()`) has no HTTP
adapter, and the module does nothing there.
