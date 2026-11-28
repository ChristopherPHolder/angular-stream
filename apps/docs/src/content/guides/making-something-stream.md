A part of a page streams when it is a `@defer` block with a `hydrate` trigger,
directly inside an element, and its data comes through `HttpClient`. Everything
else on the page is the shell, which the server sends at once.

## The least code

Three steps. The first two are per part; the third is once per app.

### 1. Put the slow part in a `@defer` block

```html title="page.html"
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
what lets the server replace it underneath a running application. Everything
outside a block is the shell, and the shell is sent once: if it changes after
that, the client renders the change itself from the streamed data, and the
change never appears in the server HTML. Text that depends on data belongs
inside a block.

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

[The demo](https://angular-ssr-stream-demo.chris-holder.workers.dev/) is a page
built this way: one widget whose data takes five seconds, timed as its HTML
arrives and as it hydrates.

## Rules

- **`hydrate when <data is there>`** hydrates the block as soon as its own data
  has arrived, while other blocks are still streaming. Prefer it.
- **`hydrate on idle | immediate | timer | viewport`** say nothing about data, so
  on a streamed render they wait for the end of the stream.
- **Blocks nest.** A block that changes inside an unchanged one is sent by
  itself, and can still be swapped in after the outer block has hydrated. The
  cast list on the movie page works this way.
- **"Directly inside an element"** is a requirement. Angular finds nodes by
  counting, and a block at the root of an `@if`, in an `<ng-container>` or in
  projected content is part of its parent's count. The server logs a warning for
  such a block and leaves it to the client.
- **What a block renders with no data is what paints first.** It is in the
  shell, so make it a proper loading state.
- **Chunks follow the network, not the document.** They go out in the order
  requests finish, and a request that finishes before the shell is taken lands
  in the shell instead of a chunk.

## Consequences

A few consequences that are easy to miss:

- **The shell is sent once.** Anything outside a `@defer` block that changes
  after the shell is taken is rendered by the client, and never appears in the
  server HTML. If text matters to crawlers or to first paint, it belongs inside
  a block, or must not depend on data that arrives later. The list page's
  `<h1>`/`<h2>` do both: they sit in a block of their own inside `<header>`, a
  category's heading comes from the URL and is in the shell, and a genre's
  name streams in with the genre list.
- **The placeholder is what paints first.** Whatever a block renders with no
  data is in the shell and in the first paint. The movie lists currently render
  their empty state ("No results" and a sad icon) above the loader until their
  chunk arrives.
- **Order follows the network.** Chunks go out in the order requests finish,
  not in document order. A request that finishes before the shell is taken
  lands in the shell, and no chunk is sent for it: on a cold request the genre
  links were already in a 43 KB shell, and on warm requests they streamed as
  `d0`. Do not write tests that expect a fixed sequence of chunks. Nothing
  here coordinates the reveal order of sibling blocks, the way React's
  experimental `SuspenseList` does with `revealOrder` and `tail` (see the
  [API reference](https://17.reactjs.org/docs/concurrent-mode-reference.html#suspenselist),
  the [worked example](https://17.reactjs.org/docs/concurrent-mode-patterns.html#suspenselist)
  and its
  [`unstable_SuspenseList` export](https://github.com/facebook/react/blob/edae846a9a17442c00429f2b15375afbfa0376c9/packages/react/index.experimental.js#L36)).
  Each block reveals when its own chunk arrives.
- **Everything in transfer state ships.** A chunk carries the full response of
  each request that finished, whether the page uses all of it or not.

If you know streaming from React or Next.js,
[React Suspense streaming, in Angular](coming-from-react-suspense.md) maps a
`<Suspense>` boundary onto all of this.
If you know Analog's `renderStream()`,
[Analog's streaming SSR, compared](analog-streaming-ssr.md) sends one page
through both.
