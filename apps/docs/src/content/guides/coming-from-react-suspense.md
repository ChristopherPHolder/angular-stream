If you know streaming from React 18 or the Next.js App Router, you know what
this library does: a shell first, then each slow part later in the same
response, put in place by an inline script. Angular has no `<Suspense>`, so the
parts have other names here, and a few of them behave differently. This page
maps one onto the other.

## The same page in both

A product page whose reviews are slow. In React, the reviews go in a boundary
with a fallback:

```tsx title="React"
<article>
  <Product id={id} />
  <Suspense fallback={<ReviewsSkeleton />}>
    <Reviews id={id} />
  </Suspense>
</article>
```

Here they go in a `@defer` block with a `hydrate` trigger:

```html title="product.html"
<article>
  <app-product [id]="id()" />
  <section>
    @defer (on immediate; hydrate when reviews()) {
    <div>
      @if (reviews(); as list) {
      <app-reviews [reviews]="list" />
      } @else {
      <app-reviews-skeleton />
      }
    </div>
    }
  </section>
</article>
```

```ts title="product.ts"
// An ordinary request. Nothing here knows about streaming.
readonly reviews = toSignal(inject(HttpClient).get<Review[]>('/api/reviews'));
```

Both send the product and the skeleton at once, and the reviews when their
data is there.

## What maps to what

| In React                                               | Here                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| A `<Suspense>` boundary                                | A `@defer` block with a `hydrate` trigger, directly inside an element                                         |
| Its `fallback`                                         | What the block renders while it has no data: the `@else` above                                                |
| `loading.js` in Next.js                                | No file for it. A block around the route's content does the same                                              |
| A component suspends                                   | An `HttpClient` request the server made has not finished                                                      |
| The content is ready                                   | The request finished and the application rendered the result                                                  |
| HTML and an inline `<script>` that replaces a fallback | The block's markup in a `<template>` and an inline script that swaps it in                                    |
| Selective hydration                                    | The block hydrates when its trigger fires. `hydrate when reviews()` fires as soon as its data has arrived     |
| Nested boundaries                                      | Nested blocks. An inner block that changes is sent by itself                                                  |
| `renderToPipeableStream()`, `renderToReadableStream()` | `createStreamingHandler()`, or the adapter for your [runtime](../getting-started/installation.md#install)     |
| The data is not fetched again in the browser           | The same: a chunk carries the response, and a request the server is already making is held back until it does |

[Making something stream](making-something-stream.md) has the rules for the
right-hand column.

## Where it differs

**The fallback is not a separate template.** A boundary has a `fallback` prop.
A block with a `hydrate` trigger has no such slot on the server: Angular
[renders its content][ih], not its `@placeholder`. The loading state is
whatever that content renders with no data, so write it as a proper one, as
the `@else` does above. A `@placeholder` still shows on a client-side
navigation, as it does for any `@defer` block.

**Nothing suspends.** In React a boundary waits because something inside it
reads a promise, and ["Suspense does not detect when data is fetched inside an
Effect or event handler"][suspense]. Here nothing is thrown and nothing has to
opt in. Components make ordinary `HttpClient` requests,
`streamHttpInterceptor` reports each one to the renderer, and the server sends
a chunk each time one finishes. Only `HttpClient` requests are streamed for;
any other pending work is waited for before the shell, as in Angular's own
render.

**Data outside a block does not hold the shell back.** React waits for
everything outside a boundary before it sends [the shell][shell], so a
component that suspends there delays the whole page. Here the shell goes out
without waiting for any request. Text outside a block that depends on data is
not in the server's HTML at all: the client renders it when the data arrives.
If it matters to first paint or to a crawler, it belongs in a block.

**Every streamed part hydrates.** With Server Components a streamed part can
be HTML for good: ["Server Components are not sent to the browser, so they
cannot use interactive APIs like `useState`"][rsc]. Angular has no such split.
A block is an ordinary component, its code is loaded, and it hydrates. What
you choose is when, with the trigger.

**The trigger decides more than it does in React.** `hydrate when <its data
is there>` hydrates a block as soon as its own chunk has landed. `hydrate on
idle`, `immediate`, `timer` and `viewport` say nothing about data, so on a
streamed render they wait for the end of the stream.

**A block has to sit directly inside an element.** A boundary can go anywhere
in the tree. A block at the root of an `@if`, in an `<ng-container>` or in
projected content is left to the client, and the server logs a warning.

**Nothing coordinates the order parts are revealed in.** There is no
counterpart to React's experimental `SuspenseList`. Each block appears when
its own chunk arrives, in the order the requests finish.

**A failure is handled later.** When a component inside a boundary throws on
the server, React [sends the fallback and tries again in the
browser][recover]. Here, if the render fails after the shell has gone, the
server breaks off the stream, the browser keeps what it has, and the
application fetches what is missing itself. See
[When something goes wrong](../concepts/internals.md#when-something-goes-wrong).

## What is the same

The idea is, and so is what it costs:

- **The status code goes out with the shell.** React's docs: ["once you start
  streaming, you can no longer set the response status code"][status].
  Next.js's: ["You cannot change the status code or headers after streaming
  starts."][next] It is the same response here, with the same limit.
- **A late part needs JavaScript to be put in place**, an inline script in
  both. It does not need the framework: in both, the swap happens before the
  application's own code has loaded.
- **Something between the server and the browser can undo it.** Compression
  and proxies buffer; see
  [Streaming through proxies](streaming-through-proxies.md).
- **A slow request is as slow as before.** Streaming stops the rest of the
  page from waiting for it.

## Where to go next

- [Making something stream](making-something-stream.md): the least code that
  streams a part of a page, the rules for a block, and what follows from them.
- [The demo](https://angular-ssr-stream-demo.chris-holder.workers.dev/) streams
  one widget, and times it as it arrives and as it hydrates.
- [Why stream out of order](../concepts/why-stream-out-of-order.md): React's
  place among the frameworks that did this first.
- [Caveats and limitations](../reference/limitations.md): what does not work
  yet.

[ih]: https://angular.dev/guide/incremental-hydration
[suspense]: https://react.dev/reference/react/Suspense#caveats
[shell]: https://react.dev/reference/react-dom/server/renderToPipeableStream#specifying-what-goes-into-the-shell
[rsc]: https://react.dev/reference/rsc/server-components#adding-interactivity-to-server-components
[recover]: https://react.dev/reference/react-dom/server/renderToPipeableStream#recovering-from-errors-outside-the-shell
[status]: https://react.dev/reference/react-dom/server/renderToPipeableStream#setting-the-status-code
[next]: https://nextjs.org/docs/app/guides/streaming
