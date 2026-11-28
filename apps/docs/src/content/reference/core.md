```bash
npm install @push-based/angular-ssr-stream-core@next
```

Two entry points: `@push-based/angular-ssr-stream-core` for the browser config,
and `@push-based/angular-ssr-stream-core/server` for the server. Neither imports
anything runtime-specific; the server half speaks web `Request`, `Response`
and `ReadableStream` only.

## Browser

### `provideStreamHydration()`

```ts
function provideStreamHydration(): EnvironmentProviders;
```

Lets `@defer` blocks with a `hydrate` trigger receive server-rendered content
after the shell. Add it **after** `provideClientHydration()`, whose dehydrated
block registry it replaces with one that knows about the stream.

It attaches the app to the inline runtime (`window.__ngs`) before anything
hydrates, and from then on:

- rewrites the hydration data Angular holds for a block whose markup was
  replaced, so hydrating it walks the new markup;
- holds back each HTTP request the server is already making, and lets it
  through once the response is in transfer state;
- keeps blocks whose trigger says nothing about their data (idle, timer,
  immediate, viewport) out of Angular's registry until the stream ends.

Without a runtime on the page (the buffered fallback, or the server itself)
all of it is inert.

On the server, during a streamed render, it also turns off Angular's HTTP
stability tracking and the automatic rendering of `@defer` blocks, which the
renderer does itself. Anywhere else, a buffered or prerendered page included,
those stay as they are.

### `streamHttpInterceptor`

```ts
const streamHttpInterceptor: HttpInterceptorFn;
```

On the server, reports each request to the streaming renderer, which sends a
chunk when one finishes. It runs the request outside the Angular zone and
hands its events back inside it, so that with Zone.js an open request doesn't
keep the app from being stable, which would hold the shell back. In the browser, parks a request the server is already
making until its response has arrived on the stream, then lets it through to
the transfer cache. Register it with
`provideHttpClient(withInterceptors([streamHttpInterceptor]))`.

### `STREAM_HYDRATION_CLIENT`

```ts
const STREAM_HYDRATION_CLIENT: InjectionToken<StreamHydrationClient>;
```

The application's one `StreamHydrationClient`, provided in root. The two APIs
above use it; apps rarely need it directly.

### `SERVER_REQUEST_TRACKER`

```ts
interface ServerRequestTracker {
  /** Marks one request as started; the returned function marks it finished. */
  track(key: string): () => void;
}

const SERVER_REQUEST_TRACKER: InjectionToken<ServerRequestTracker>;
```

Provided by the streaming renderer only, on the server platform. Angular's own
HTTP stability tracking is off during a streamed render, so that
`whenStable()` means "the route and its `@defer` blocks are in place" rather
than "every request has answered", and the renderer waits on this tracker
instead.

### Wire format

`StreamChunk`, `StreamBlock`, `StreamInit`, `StreamRuntime`, `NGH` and
`streamRequestKey()` describe what travels in a chunk. See
[Wire format and internals](../concepts/internals.md#the-wire-format).

## Server

### `createStreamingHandler()`

```ts
function createStreamingHandler<Context = void>(
  options: StreamingHandlerOptions<Context>,
): StreamingHandler<Context>;

interface StreamingHandlerOptions<Context = void> {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /** The application's server config, provideServerRendering() included. */
  config: ApplicationConfig;
  /** Every hostname the server answers for. */
  allowedHosts: readonly string[];
  /** The contents of @angular/core/event-dispatch-contract.min.js, for withEventReplay(). */
  eventDispatchContract?: string;
  /** Fetches the built index.html. A response that isn't ok turns into a 404. */
  loadTemplate(request: Request, context: Context): Promise<Response>;
}

type StreamingHandler<Context = void> = (request: Request, context: Context) => Promise<Response>;
```

The runtime-agnostic page handler, and what every adapter wraps. For each
request it:

1. applies Angular's host guard, answering `403` for a host not in
   `allowedHosts`;
2. loads the template with `loadTemplate`, answering `404` if that fails, and
   adds `eventDispatchContract` to it;
3. streams the route into it with `renderStreamingAngular()`;
4. if streaming throws before its first flush, renders the page buffered
   instead, with `createBufferedRender()`.

`Context` is whatever the runtime hands each request besides the `Request`,
such as a Worker's `env`, and is passed through to `loadTemplate`. Every request
that reaches the handler is treated as a page request: serve static assets
before it.

`eventDispatchContract` is what `withEventReplay()` needs to queue the clicks
made before the page hydrates. Angular's server renderer only sets up replay
when the template already holds Angular's event dispatch contract script; when
it doesn't, early clicks are lost without an error. The Angular CLI and ngp add
that script to the template a server renders into, but a template your server
fetches itself, such as the built `index.html` behind a Worker's `ASSETS`
binding, doesn't have it. Pass the file's contents and the handler puts the
script right after `<body>`, unless the template has it already. With Vite:

```ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
```

When the page has listeners to replay but no contract, the renderer logs a
warning, once.

### `renderStreamingAngular()`

```ts
function renderStreamingAngular(options: StreamingAngularRenderOptions): Promise<Response>;

type StreamingAngularRenderOptions = {
  /** The index.html template to render into. */
  document: string;
  url: string;
  /** More providers for the server platform: REQUEST, LOCALE_ID, … */
  platformProviders?: StaticProvider[];
  /** Status and headers, read when the shell is ready. */
  responseInit?: ResponseInit;
  /** Called once the app is stable; a Response returned here is sent instead. */
  beforeCommit?: (
    applicationRef: ApplicationRef,
  ) => Response | undefined | Promise<Response | undefined>;
  /** Rewrites the shell's document before it is sent: critical CSS, for instance. */
  transformDocument?: (document: string) => string | Promise<string>;
  /** Stops the render, before or after the shell has gone out. */
  signal?: AbortSignal;
} & (
  | { rootComponent: Type<unknown>; config: ApplicationConfig }
  | { bootstrap: (context: BootstrapContext) => Promise<ApplicationRef> }
);
```

The streaming renderer itself: resolves once the shell is ready, with a
response whose body is the shell followed by a chunk per finished request. The
status is `responseInit.status`, `200` without one, and the response carries
`Cache-Control: no-store`: a cached copy of a partial response would be worse
than none. It throws if rendering fails before the first flush; after that, the
error breaks the stream.

The app is given as a root component and its server config, or as a function
that bootstraps it on the platform it is handed, which is what an Angular CLI
app's `main.server.ts` exports. A bootstrap function's config can't be added
to, so the providers the renderer needs come from `provideStreamHydration()`
in that config. With `rootComponent`, the renderer adds them itself.

`responseInit` is read once the app is stable, so an app that is handed the
same object, as `@angular/ssr` hands it `RESPONSE_INIT`, can still change the
status until then. The adapter for `@angular/ssr` is built on these options;
see [`withStreaming()`](angular-ssr.md#withstreaming).

### `createBufferedRender()`

```ts
function createBufferedRender(
  options: StreamingAppOptions,
): (url: string, document: string) => Promise<string>;
```

Angular's `renderApplication`, with incremental hydration switched off: the
fallback for a streaming render that fails before it commits. `@defer` blocks
are left for the client to render from the transfer state this render fills.
See [When something goes wrong](../concepts/internals.md#when-something-goes-wrong).
