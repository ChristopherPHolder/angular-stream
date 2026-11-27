```bash
npm install @push-based/angular-stream-nestjs@next
```

The NestJS module, for `@nestjs/platform-express`. It is built on the
[Node adapter](node.md) and depends on
[`@push-based/angular-stream-core`](core.md), whose browser providers the app
still needs. It needs `@nestjs/common`, `@nestjs/core` and
`@nestjs/platform-express` 12. For the whole setup, see
[NestJS](../getting-started/nestjs.md).

Two entry points: `@push-based/angular-stream-nestjs` for the server, and
`@push-based/angular-stream-nestjs/vite` for the dev server.

## `AngularStreamModule.forRoot()`

```ts
class AngularStreamModule {
  static forRoot(options: AngularStreamModuleOptions): DynamicModule;
  static forRootAsync(options: AngularStreamModuleAsyncOptions): DynamicModule;
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

When the app initializes, the module adds one middleware to the Express app,
last: right before Nest's own 404 and error handlers. That is after the
controllers' routes, and after whatever other modules add when they
initialize (`ServeStaticModule`, `GraphQLModule`), whichever order Nest runs
their `onModuleInit` hooks in. For each request that reaches it, in order:

1. Under the global prefix (`app.setGlobalPrefix('api')`), the request is
   passed on, so an unknown `/api/...` gets Nest's `404`. The prefix is matched
   by whole path segments: `/apiary` is a page.
2. A method other than `GET` and `HEAD` is passed on, and ends in a 404
   unless something after the module takes it.
3. Under `/assets/`, a file in `staticDir` is served from disk, and anything
   else is a `NotFoundException` (`404`), not a page: Vite names those files
   by their content hash, so a missing one is an old or mistyped URL, such as
   a chunk from before a deploy.
4. With `staticDir`, any other file in it is served from disk. A path that
   ends in `.html` is left to the renderer, so `/` and `/index.html` render.
   The check is case-sensitive, so on a case-insensitive disk `/INDEX.HTML`
   can still be sent as the raw template.
5. Everything else is rendered as a streamed page.

A controller, or a route or middleware another module adds, always answers
first, wherever it is mounted: pages are only what is left.

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
  included, since Express runs it before any route.

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
complete one, and no filter writes into it.

## `AngularStreamModule.forRootAsync()`

```ts
interface AngularStreamModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  useFactory?: (...args: any[]) => AngularStreamModuleOptions | Promise<AngularStreamModuleOptions>;
  inject?: InjectionToken[];
  useClass?: Type<{ create(): AngularStreamModuleOptions | Promise<AngularStreamModuleOptions> }>;
  useExisting?: Type<{
    create(): AngularStreamModuleOptions | Promise<AngularStreamModuleOptions>;
  }>;
}
```

The same module, with the options from a provider, as Nest's
`ConfigurableModuleBuilder` defines it:

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

The injection token the module's options are provided under.

## `createRequestListener()`

```ts
function createRequestListener(app: INestApplication): NodeHandler;
```

A `node:http` request listener, `(req, res, next?)`, that hands each request
to the app's Express instance: the server entry's default export, for
[`angularStreamNest()`](#angularstreamnest) to call in `vite dev`.

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix('api');

export default createRequestListener(app);

if (import.meta.env.PROD) {
  await app.listen(3000);
}
```

The first request calls `app.init()`, which registers the routes and the
render route; `app.listen()` does the same in production, and only once. Vite
rewrites a page request's URL to `/index.html` before it reaches the listener,
so the listener puts back `req.originalUrl`, the URL that was asked for, for
Nest to route.

## `angularStreamNest()`

```ts
import { angularStreamNest } from '@push-based/angular-stream-nestjs/vite';

function angularStreamNest(options?: AngularStreamNestOptions): Plugin[];

interface AngularStreamNestOptions {
  /** The server entry, relative to Vite's root. Default: 'src/server.ts'. */
  entry?: string;
  /** The template, relative to Vite's root. Default: 'index.html'. */
  template?: string;
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
  its middleware always comes before the render route.

In each case a missing file under `/assets/` is a `404`.

## Decorators

The package is published without decorators: the module is a
`ConfigurableModuleBuilder` class, and its one provider a factory. It works
whatever compiles the app's own decorators. The app's controllers and
services need `experimentalDecorators` and `emitDecoratorMetadata`, which
Vite's transform reads from the tsconfig; see
[TypeScript](../getting-started/nestjs.md#5-typescript).

## Fastify

`@nestjs/platform-fastify` isn't supported yet. On it, the module throws when
the app initializes:

```text
[angular-stream] AngularStreamModule renders pages on @nestjs/platform-express; this application runs on 'fastify'.
```
