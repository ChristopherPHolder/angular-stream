```bash
npm install @push-based/angular-stream-core@next
```

Two entry points: `@push-based/angular-stream-core` for the browser config,
and `@push-based/angular-stream-core/server` for the server. Neither imports
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

### `streamHttpInterceptor`

```ts
const streamHttpInterceptor: HttpInterceptorFn;
```

On the server, reports each request to the streaming renderer, which sends a
chunk when one finishes. In the browser, parks a request the server is already
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

Provided by the streaming renderer only. It turns off Angular's own HTTP
stability tracking, so that `whenStable()` means "the route and its `@defer`
blocks are in place" rather than "every request has answered", and waits on
this tracker instead.

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
  /** Fetches the built index.html. A response that isn't ok turns into a 404. */
  loadTemplate(request: Request, context: Context): Promise<Response>;
}

type StreamingHandler<Context = void> = (request: Request, context: Context) => Promise<Response>;
```

The runtime-agnostic page handler, and what every adapter wraps. For each
request it:

1. applies Angular's host guard, answering `403` for a host not in
   `allowedHosts`;
2. loads the template with `loadTemplate`, answering `404` if that fails;
3. streams the route into it with `renderStreamingAngular()`;
4. if streaming throws before its first flush, renders the page buffered
   instead, with `createBufferedRender()`.

`Context` is whatever the runtime hands each request besides the `Request`,
such as a Worker's `env`, and is passed through to `loadTemplate`. Every request
that reaches the handler is treated as a page request: serve static assets
before it.

### `renderStreamingAngular()`

```ts
function renderStreamingAngular(options: {
  rootComponent: Type<unknown>;
  config: ApplicationConfig;
  /** The index.html template to render into. */
  document: string;
  url: string;
}): Promise<Response>;
```

The streaming renderer itself: resolves once the shell is ready, with a
`200` response whose body is the shell followed by a chunk per finished
request. The response carries `Cache-Control: no-store`: a cached copy of a
partial response would be worse than none. It throws if rendering fails
before the first flush; after that, the error breaks the stream.

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
