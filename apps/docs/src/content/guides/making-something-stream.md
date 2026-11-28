A part of a page streams when it is a `@defer` block with a `hydrate` trigger,
directly inside an element, and its data comes through `HttpClient`. Everything
else on the page is the shell, which the server sends at once.

## The least code

Three steps. The first two are per part; the third is once per app.

### 1. Put the slow part in a `@defer` block

```angular-html title="page.html"
<section>
  @defer (on immediate; hydrate when widget()) {
    <div>
      @if (widget(); as data) {
        <app-widget [data]="data" />
      } @else {
        <p>Loading…</p>
      }
    </div>
  }
</section>
```

The block is what the server can send later. Give it a `hydrate when` trigger
that turns true when its data is there. The `@else` branch goes out with the
shell, so it is what paints first.

Angular leaves such a block's markup alone until the trigger fires, which is
what lets the server replace it underneath a running application.

### 2. Load its data with `HttpClient`

```ts title="page.ts"
export class Page {
  // An ordinary request. Nothing here knows about streaming.
  readonly widget = toSignal(inject(HttpClient).get<WidgetData>('/api/widget'));
}
```

The server makes the request and streams the block when the response is in. The
browser asks for the same data, but its request is held back and answered from
the stream. Nothing is fetched twice.

### 3. Switch streaming on

This is the setup, and your runtime's page has all of it: pick it from
[the table in Installation](../getting-started/installation.md#install). It
comes to two additions to the app's providers and a server entry that renders
with the streaming renderer.

<!-- include ../_shared/browser-config.md -->

The server entry is where runtimes differ. On Cloudflare Workers it is this:

```ts title="src/worker.ts"
import { createStreamingWorker } from '@push-based/angular-ssr-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

// config is appConfig plus provideServerRendering().
export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost'],
});
```

With the Angular CLI, it is `withStreaming()` around `@angular/ssr`'s engine;
see [Angular CLI](../getting-started/angular-cli.md).

[The demo](https://angular-ssr-stream-demo.chris-holder.workers.dev/) is a page
built this way: one widget whose data takes five seconds, timed as its HTML
arrives and as it hydrates.

## Rules

- **Prefer `hydrate when <its data is there>`.** It hydrates the block as soon
  as its own data has arrived, while other blocks are still streaming.
  `hydrate on idle | immediate | timer | viewport` say nothing about data, so on
  a streamed page they wait for the end of the stream.
- **A block sits directly inside an element.** Angular finds nodes by counting,
  and a block at the root of an `@if`, in an `<ng-container>` or in projected
  content is part of its parent's count. The server logs a warning for such a
  block and leaves it to the client. Wrap it in a `<div>`.
- **Blocks nest.** A block that changes inside an unchanged one is sent by
  itself, and can still be swapped in after the outer block has hydrated.
- **The shell is sent once.** Anything outside a block that changes after the
  shell is taken is rendered by the client, and never appears in the server
  HTML. Text that depends on data, a heading named after what loads, say,
  belongs inside a block, or must not depend on that data. That matters most
  for what crawlers and the first paint see.
- **What a block renders with no data is what paints first.** It is part of the
  shell, so make it a proper loading state, not an empty state: "No results"
  shown until the results arrive reads as an answer.
- **Chunks follow the network, not the document.** They go out in the order
  requests finish, and a request that finishes before the shell is taken lands
  in the shell, with no chunk at all. So a fast API makes a page that doesn't
  seem to stream, and tests must not expect a fixed sequence of chunks. Nothing
  coordinates the order sibling blocks appear in, the way React's experimental
  [`SuspenseList`](https://17.reactjs.org/docs/concurrent-mode-reference.html#suspenselist)
  does: each block appears when its own chunk arrives.
- **Everything in transfer state ships.** A chunk carries the full response of
  each request that finished, whether the page uses all of it or not.

## When a request fails

Catch the error where the request is made, and give the block an error state of
its own. A `toSignal()` whose observable errors throws when it's read, which
breaks the template; a value for each outcome doesn't:

```ts title="page.ts"
type Result = { ok: true; widget: WidgetData } | { ok: false };

export class Page {
  readonly result = toSignal(
    inject(HttpClient)
      .get<WidgetData>('/api/widget')
      .pipe(
        timeout(10_000),
        map((widget): Result => ({ ok: true, widget })),
        catchError(() => of<Result>({ ok: false })),
      ),
  );
}
```

```angular-html title="page.html"
<section>
  @defer (on immediate; hydrate when result()) {
    <div>
      @if (result(); as result) {
        @if (result.ok) {
          <app-widget [data]="result.widget" />
        } @else {
          <p>The widget couldn't be loaded.</p>
        }
      } @else {
        <p>Loading…</p>
      }
    </div>
  }
</section>
```

- **On the server**, a failed request ends like any other: the block is
  rendered with the error state and streamed.
- **In the browser**, the same request isn't answered from the stream. Angular's
  transfer cache only keeps successful responses, so once the server's attempt
  is over, the browser makes the request itself, and the block shows what that
  returns: the widget if it succeeds this time, the error state if not. There
  is no hydration error either way.
- **A request that never answers** keeps the response open until the runtime or
  a proxy gives up, and the page never finishes loading. `timeout()` ends it, so
  the block streams its error state and the stream can close.

## Data from outside `HttpClient`

The renderer follows the requests `streamHttpInterceptor` sees, which are the
ones `HttpClient` makes. Other data depends on how Angular sees it:

- **A `resource()`, and so an `httpResource()`,** counts as pending work, and
  the shell waits for pending work. The page goes out in one piece once the
  data is in: complete, but not streamed. Use `inject(HttpClient).get()`.
- **With Zone.js, a `fetch()` or a timer** keeps the app from being stable, and
  holds the shell back the same way.
- **Zoneless, a `fetch()` or a client library's promise** isn't waited for at
  all. The block goes out with its loading state, and the browser loads the data
  itself.

To stream such data anyway, tell the renderer about it with
[`SERVER_REQUEST_TRACKER`](../reference/core.md#server_request_tracker), and
hand the result to the browser through `TransferState`, which every chunk
carries:

```ts title="streamed.ts"
import { NgZone, type Signal, TransferState, inject, makeStateKey, signal } from '@angular/core';
import {
  SERVER_REQUEST_TRACKER,
  STREAM_HYDRATION_CLIENT,
} from '@push-based/angular-ssr-stream-core';
import { firstValueFrom } from 'rxjs';

/**
 * Loads data the way streamHttpInterceptor loads a request: followed on the
 * server, and taken from the stream in the browser. Call it in an injection
 * context, with a key unique to the data.
 */
export function streamed<T>(key: string, load: () => Promise<T>): Signal<T | undefined> {
  const state = inject(TransferState);
  const stateKey = makeStateKey<T>(key);
  const tracker = inject(SERVER_REQUEST_TRACKER, { optional: true });
  const value = signal<T | undefined>(undefined);

  if (tracker !== null) {
    // The server: the renderer waits for it, then streams the block and the state.
    const done = tracker.track(key);
    inject(NgZone)
      .runOutsideAngular(load)
      .then((data) => {
        state.set(stateKey, data);
        value.set(data);
      })
      .finally(done);
  } else {
    // The browser: wait while the server is still loading it, then read the state.
    const released = inject(STREAM_HYDRATION_CLIENT).released(key);
    const read = (): Promise<T> =>
      state.hasKey(stateKey) ? Promise.resolve(state.get(stateKey, null as T)) : load();
    (released ? firstValueFrom(released).then(read) : read()).then((data) => value.set(data));
  }
  return value.asReadonly();
}
```

```ts title="page.ts"
export class Page {
  readonly widget = streamed('widget', () => sdk.widgets.get('front-page'));
}
```

The block is written as in step 1. The renderer sends it when `load()` has
settled, with the result in the chunk's transfer state, and the browser reads it
from there instead of calling `load()` again. Without a server, on a client-side
navigation, `load()` runs in the browser as usual. A failure is yours to catch
inside `load()`, as above. Running `load()` outside the Angular zone keeps it
from holding the shell back with Zone.js. This was checked zoneless, in a dev
build, loading the page twice: the block streamed, hydrated, and the browser
didn't call `load()`.

If you know streaming from React or Next.js,
[React Suspense streaming, in Angular](coming-from-react-suspense.md) maps a
`<Suspense>` boundary onto all of this.
If you know Analog's `renderStream()`,
[Analog's streaming SSR, compared](analog-streaming-ssr.md) sends one page
through both.
