[Analog](https://analogjs.org), the Angular meta-framework, has a streaming
renderer of its own: [`renderStream()`][docs], added in version 2.7,
experimental and opt-in. It and this library build on the same piece of Angular,
[incremental hydration][ih], and an app marks its slow parts the same way in
both: a `@defer` block with a `hydrate` trigger. What differs is what goes over
the wire, and when. This page sends one page through both and reads the two
responses.

Everything said about Analog here is from version 3.0.0: its [docs][docs], the
[RFC][rfc] its renderer was built from, [its source][render], and a response
recorded from an app built with it. The RFC lists what is planned next, so
expect some of this to change.

## The same page through both

The page is the one in Analog's own [example app][example]: a heading and a
component outside any block, and three blocks. Block B shows a label that comes
from a request taking 600 ms.

```html title="index.page.ts, its template"
<h1>Analog Streaming SSR</h1>
<app-shell-status />

<!-- A needs no data. -->
@defer (hydrate on immediate) {
<app-fast-a />
} @placeholder {
<p>Loading A…</p>
}

<!-- B's label comes from a request that takes 600 ms. -->
@defer (hydrate on immediate) {
<app-slow-b />
} @placeholder {
<p>Loading B…</p>
}

<!-- C hydrates on the first click or key press in it. -->
@defer (hydrate on interaction) {
<app-trigger-c />
} @placeholder {
<p>Loading C…</p>
}
```

Here is what arrived, and when:

|        Time | Analog 3.0.0                                                                                                                                                        | angular-ssr-stream                                                                                                                                 |
| ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.03&nbsp;s | `<head>`, with the entry script as a `modulepreload`. An inline runtime, and an empty `<div data-analog-stream>`                                                    | The shell: the heading, the component and all three blocks, each where it belongs. B says `label = loading`. Then the runtime and the entry script |
| 0.03&nbsp;s | Blocks A, B and C, each in a `<template>` that a script appends to that `<div>`. B says `label = loading`                                                           |                                                                                                                                                    |
|  0.6&nbsp;s | The whole document in two templates: its `<head>`, and its `<body>` with the heading, the component, all three blocks again and the transfer state. B says `summer` | Block B by itself, in a `<template>`, with a script that swaps it in where the old one was. B says `summer`                                        |
|  0.6&nbsp;s | A script replaces `<body>` with that document and starts the entry script                                                                                           | `</body></html>`                                                                                                                                   |

So after 0.03 seconds a reader of the Analog page sees the three blocks, one
under the other, with no heading above them, and nothing on the page answers a
click until 0.6 seconds. Here the reader sees the whole page with B in its
loading state, and the browser is already loading Angular to hydrate it.

**How this was captured:** Analog 3.0.0 on Angular 22.3.0, built with
`experimental.streaming` on and served by its Nitro Node server.
angular-ssr-stream from `main`, with the Node adapter. Each response was read
with `fetch()`, noting when every read arrived. Two things differ between the
two apps. Here each block is wrapped in a `<div>`, since a block has to sit
[directly inside an element](making-something-stream.md#rules). And B loads
its data with `HttpClient.get()`, not `httpResource()`, for the reason under
[What a block waits for](#what-a-block-waits-for).

## Where they differ

### What the first flush is

Analog sends the document's head before the application has rendered anything,
so the browser can start on the stylesheets and scripts at once. The page's own
markup is not in it. The RFC:

> today the first flush is just the head plus an empty stream region, and only
> `@defer` blocks stream before the tail.

Everything outside a block, which is the heading, the navigation and any
component that is not deferred, arrives at the end. Its authors measured what
follows from that: with the largest element outside a block, largest
contentful paint came out the same streamed as buffered, and ["Streaming
improves LCP only when the LCP element streams early"][rfc-cwv].

Here the first flush is the shell: the application rendered up to the point
where it waits for data, with every block in the state it has without any.
That puts the time this first render takes in front of the first byte, and
the page on screen with it.

### What a block waits for

Analog sends a block when Angular has finished rendering it on the server, and
sends it once. In the response above all three blocks went out at 0.03
seconds, B with `label = loading`, because that is what B showed then. Its
data arrived in the document at the end.

Here a chunk is data arriving. Each time an `HttpClient` request finishes and
the application has rendered the result, the server sends the blocks that
changed. B's final markup left the server the moment its request was answered,
while any slower request would still be running.

That depends on the renderer following the requests, and it only follows
`HttpClient`. A `resource()`, and so an `httpResource()`, counts as pending
work in Angular, and the shell waits for pending work. The same page with
`httpResource()` in B was sent here in one piece after 0.6 seconds: complete,
but not streamed. Load a block's data with `inject(HttpClient).get()`, as
[Making something stream](making-something-stream.md#2-load-its-data-with-httpclient)
does. In Analog it makes no difference: either way the data arrives with the
final document.

### Where a block lands

Analog [appends each block][runtime] to one region at the top of `<body>`, in
the order the blocks resolved. The region is a preview. When the final
document arrives the whole body is replaced, and the RFC says what that costs:

> `__analogFinalize` replaces the whole body in one `replaceChildren`, so the
> progressively-painted preview is torn down and rebuilt; that swap registers
> as a shift.

Here a chunk replaces the block's own nodes, in front of its anchor comment,
and touches nothing else. The page still shifts if a block's loading state and
its content differ in size, so give the loading state the room.

### When the page hydrates

In Analog, at the end. The [docs][docs]:

> Bootstrap modules are preloaded with the shell and execute after the
> complete, hydration-ready document is installed.

The RFC names the reason: Angular's hydration data describes a whole document,
so ["rendering streams progressively, but hydration begins when the tail
arrives."][rfc-boundary] A page whose slowest request takes five seconds is
visible early and interactive after five.

Here the entry script is in the shell. The browser hydrates everything outside
the blocks while the response is still open, and a block with a
`hydrate when <its data is there>` trigger hydrates as soon as its own chunk
has landed. Doing that means annotating blocks for hydration one at a time,
which is the part Analog [chose to leave out](#how-each-gets-into-angular).

### How often a block is sent

In Analog, twice. The RFC: "The blocks are effectively sent twice (progressive
preview during render + authoritative copy in the tail)", which it measured as
twice the bytes of the buffered page in its own benchmark. Sending each block
once is first on its list of future work.

Here a block is sent once for each state it goes through. A and C never
change, so they are in the shell and nowhere else. B is sent twice, as a
loading state and as its content. In the responses above, what followed the
data was 396 bytes here and 3,406 bytes in Analog.

### How each gets into Angular

Neither can do this with Angular's public API, and they reach in at different
places.

Analog changes Angular at build time. A [Vite plugin][plugin] rewrites
`@angular/core` in the server build: it adds a call where a `@defer` block
finishes rendering, and exposes the function that collects a block's nodes.
The document at the end comes from Angular's own renderer, and the browser
hydrates it with Angular's own, untouched hydration. That is a small surface:
if the code the plugin looks for has moved, it warns and the app renders
buffered. It needs Angular 21 or later.

This library patches nothing, and leans on more. On the server it calls
private Angular APIs to annotate the application again on every flush and cut
out the blocks that changed. In the browser, `provideStreamHydration()`
rewrites the hydration data Angular holds for a block whose markup was
replaced. That is what lets a block hydrate before the response has ended. It
is also why the supported Angular versions are the ones
[a check in CI proves](../getting-started/installation.md#compatibility), 19.2
to 22 today.

Analog's authors tried annotating blocks one at a time, and stopped where the
patch grew: "That maintenance surface is exactly the line where a
framework-carried string patch stops being reasonable." The RFC's conclusion
applies to both projects: "the durable form is an upstream API, not a patch a
framework maintains against private symbols."

## Side by side

| Topic                               | Analog 3.0.0                                                            | angular-ssr-stream                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Switching it on                     | `experimental: { streaming: true }` in `analog()`, and `renderStream()` | Two providers in the browser config, and a server entry                               |
| A part that streams                 | A `@defer` block with a `hydrate` trigger                               | The same, directly inside an element                                                  |
| What a flush waits for              | A block finishing its render, then the application being stable         | An `HttpClient` request finishing                                                     |
| Data in the browser                 | Transfer state, in the final document                                   | Transfer state, in each chunk. A request the server is making is held back until then |
| Title and meta set while it renders | Applied by a script at the end                                          | In the shell, if set by then. A later one is set by the application, in the browser   |
| Crawlers                            | Served the buffered render, by user agent                               | The same stream as everyone                                                           |
| A failure after the first byte      | A generic error page replaces what was shown                            | The browser keeps what it has, and the application fetches the rest                   |
| `Cache-Control`                     | `no-store, no-transform`                                                | `no-store`                                                                            |
| Angular                             | 21 or later                                                             | 19.2, 20.3, 21.2 or 22                                                                |
| Where it runs                       | Nitro, or a [custom server][custom]. Needs `node:async_hooks`           | Anything with web `Request` and `Response`, and the adapters for the rest             |
| A route that should not stream      | A `streaming: false` route rule                                         | With `@angular/ssr`, any render mode but `RenderMode.Server`                          |

## What is the same

- **The template.** Both stream `@defer` blocks with a `hydrate` trigger, and
  both need incremental hydration switched on. A page written for one already
  has its slow parts marked for the other.
- **The status code goes out with the first flush.** Analog's docs: "Use a
  buffered route when its final HTTP status must be known before sending
  response headers."
- **A late part is put in place by an inline script**, in a response that is
  not cached.
- **A slow request is as slow as before.** The RFC measured it: "completion
  time is identical".

## Which one applies

They do not compete for the same app. Analog's renderer is part of Analog: its
Vite plugin applies the patch and its server calls `renderStream()`, so an
Analog app switches it on with one option and one import. Nothing here has
been tried inside an Analog app.

This library is only the streaming, for an Angular app built by the Angular
CLI and served by `@angular/ssr`, or one with a server of its own.
[Installation](../getting-started/installation.md) has the setup for each.

## Where to go next

- [Making something stream](making-something-stream.md): the rules for a
  block here, and which trigger to pick.
- [One response, flush by flush](../concepts/walkthrough.md): a real response
  from this library, taken apart.
- [Wire format and internals](../concepts/internals.md): what a chunk
  carries, and what the browser does with it.
- [Does Angular support streaming SSR?](../concepts/angular-streaming-ssr.md):
  what Angular itself sends, and what both projects build on.

[docs]: https://analogjs.org/docs/features/server/streaming-ssr
[custom]: https://analogjs.org/docs/features/server/custom-server#streaming
[ih]: https://angular.dev/guide/incremental-hydration
[rfc]: https://github.com/analogjs/analog/blob/v3.0.0/packages/router/RFC-streaming-ssr.md
[rfc-cwv]: https://github.com/analogjs/analog/blob/v3.0.0/packages/router/RFC-streaming-ssr.md#core-web-vitals-over-http-throttled
[rfc-boundary]: https://github.com/analogjs/analog/blob/v3.0.0/packages/router/RFC-streaming-ssr.md#honest-boundary
[render]: https://github.com/analogjs/analog/blob/v3.0.0/packages/router/server/src/render-stream.ts
[runtime]: https://github.com/analogjs/analog/blob/v3.0.0/packages/router/server/src/defer-reconcile-runtime.ts
[plugin]: https://github.com/analogjs/analog/blob/v3.0.0/packages/platform/src/lib/ssr/defer-streaming-plugin.ts
[example]: https://github.com/analogjs/analog/tree/v3.0.0/apps/streaming-app
