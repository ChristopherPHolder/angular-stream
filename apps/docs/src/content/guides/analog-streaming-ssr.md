[Analog](https://analogjs.org), the Angular meta-framework, has a streaming
renderer of its own: [`renderStream()`][docs], added in version 2.7,
experimental and opt-in. It and this library build on the same piece of Angular,
[incremental hydration][ih], and an app marks its slow parts the same way in
both: a `@defer` block with a `hydrate` trigger. What differs is what goes over
the wire, and when. This page sends one page through both, steps through the
two responses side by side, and says what each does that the other does not.

Everything said about Analog here is from version 3.0.0: its [docs][docs], the
[RFC][rfc] its renderer was built from, [its source][render], and responses
recorded from an app built with it. The RFC lists what is planned next, so
expect some of this to change.

## In short

Both get their first bytes out at once. They differ in what those bytes are,
and in what a reader can do before the slowest request has finished.

- **Here, the page is on screen and answering clicks while its data loads.**
  The first flush is the page itself, and each slow part is filled in and
  hydrated when its own data arrives. In Analog the first flush is a preview of
  the blocks, and the page, its data and hydration all arrive together, when
  the slowest request is done. See [What is better here](#what-is-better-here).
- **Analog asks less of the app, and of Angular.** A block may sit anywhere and
  load its data any way, crawlers get a complete document, and the browser
  hydrates with Angular's own hydration, untouched. See
  [What Analog does that this library does not](#what-analog-does-that-this-library-does-not).
- **They are not for the same app.** Analog's renderer is part of Analog. This
  library is for an app built by the Angular CLI, or one with a server of its
  own. See [Which one applies](#which-one-applies).

## One page through both

The page is a product page cut down to what matters here: a heading with a
button under it, and two blocks that each wait for an API. The recommendations'
API answers after 0.9 seconds, and the reviews', below them, after 0.3.

```angular-html title="The page, in outline"
<h1>Trail shoes</h1>
<button (click)="count.set(count() + 1)">{{ count() }}</button>

<!-- Its API answers after 0.9 s. -->
<div>
  @defer (hydrate …) {
    <section>Recommendations … <button>…</button></section>
  }
</div>

<!-- Its API answers after 0.3 s. -->
<div>
  @defer (hydrate …) {
    <section>Reviews … <button>…</button></section>
  }
</div>
```

Step through what each renderer sent, and what the browser made of it:

<!-- figure analog-steps -->

The same moments as numbers, in seconds since the request:

| Moment                                       | Analog 3.0.0 | angular-ssr-stream |
| -------------------------------------------- | -----------: | -----------------: |
| First byte of the response                   |  0.01&nbsp;s |        0.01&nbsp;s |
| The heading is on screen                     |  0.93&nbsp;s |        0.02&nbsp;s |
| The button under the heading answers a click |  0.94&nbsp;s |        0.02&nbsp;s |
| The reviews can be read                      |  0.93&nbsp;s |        0.31&nbsp;s |
| The reviews answer a click                   |  0.95&nbsp;s |        0.32&nbsp;s |
| The recommendations can be read              |  0.93&nbsp;s |        0.91&nbsp;s |
| The recommendations answer a click           |  0.95&nbsp;s |        0.92&nbsp;s |
| The response ends                            |   0.9&nbsp;s |         0.9&nbsp;s |

**How this was captured:** Analog 3.0.0 on Angular 22.3.0 with Zone.js, built
with `experimental.streaming` on and served by its Nitro Node server.
angular-ssr-stream from `main` on Angular 22.3.0-rc.0, zoneless, with the Node
adapter. Both were production builds on one machine, and both APIs are timers.

- **The pieces and their sizes** are from reading each response with `fetch()`,
  noting when every read arrived.
- **The moments** are from Chrome. A script looked at the page every 8 ms and
  clicked each button until its counter moved. Each number is the median of
  five loads. Chrome ran headless with a desktop user agent, because Analog
  serves a headless one its [buffered render](#crawlers-get-a-complete-document).
- **Each app's blocks are written the way its own docs write one**:
  `@defer (hydrate on immediate)` with a `@placeholder` in Analog, as in its
  [example app][example], and `@defer (on immediate; hydrate when <its data>)`
  here, for the reasons in
  [Making something stream](making-something-stream.md#rules).
- **Both load their data with `HttpClient.get()`.** Analog's page was also
  recorded with `httpResource()`, and its response was the same.

## What is better here

The measurements again, as a picture. The first four rows are what a reader
has sooner here. The last two come when the slowest request does, in both.

<!-- figure analog-timeline -->

### The page is there from the first flush

Here the first flush is the shell: the application rendered up to the point
where it waits for data, with every block in the state it has without any. The
heading was on screen after 0.02 seconds.

Analog sends the document's head before the application has rendered, then
the blocks. The page's own markup, which is the heading, the navigation and
any component that is not deferred, arrives at the end: after 0.93 seconds.
The RFC:

> today the first flush is just the head plus an empty stream region, and only
> `@defer` blocks stream before the tail.

Its authors measured what follows from that: with the largest element outside
a block, largest contentful paint came out the same streamed as buffered, and
["Streaming improves LCP only when the LCP element streams early"][rfc-cwv].
Sending the shell first is on the RFC's list of future work.

### Each part arrives when its own data does

Here a chunk is data arriving. Each time an `HttpClient` request finishes and
the application has rendered the result, the server sends the blocks that
changed. The reviews were readable 0.31 seconds in, while the recommendations'
request was still running.

Analog sends a block when Angular has finished rendering it on the server,
and sends it once. Both blocks went out in the first 0.01 seconds, in their
loading state, because that is what they showed then. Their data arrived in
the document at the end, so the reviews were readable after 0.93 seconds: a
block that is ready early waits for the slowest one.

### The page answers clicks while it loads

Here the entry script is in the shell. The browser hydrates everything outside
the blocks while the response is still open, and a block with a
`hydrate when <its data is there>` trigger hydrates as soon as its own chunk
has landed. The button under the heading answered a click after 0.02 seconds,
and the reviews after 0.32.

In Analog, nothing answers before the end. The [docs][docs]:

> Bootstrap modules are preloaded with the shell and execute after the
> complete, hydration-ready document is installed.

The RFC names the reason: Angular's hydration data describes a whole document,
so ["rendering streams progressively, but hydration begins when the tail
arrives."][rfc-boundary] Everything on the page answered its first click
between 0.94 and 0.95 seconds. A page whose slowest request takes five seconds
is interactive after five. A click made before that is lost, too: the script
that records clicks for replay is part of the final document.

### What is on screen stays where it is

Here a chunk replaces the block's own nodes, in front of its anchor comment,
and touches nothing else. The page still shifts if a block's loading state and
its content differ in size, so give the loading state the room.

Analog [appends each block][runtime] to one region at the top of `<body>`, in
the order the blocks rendered. The region is a preview. When the final
document arrives the whole body is replaced, and the RFC says what that costs:

> `__analogFinalize` replaces the whole body in one `replaceChildren`, so the
> progressively-painted preview is torn down and rebuilt; that swap registers
> as a shift.

### A block is sent once for each state

Here a block is sent once for each state it goes through: in the shell as a
loading state, and in a chunk as its content. What followed the first flush
was 965 bytes, the two blocks.

Analog sends every block twice, and the rest of the page with the second
copy. The RFC: "The blocks are effectively sent twice (progressive preview
during render + authoritative copy in the tail)", which it measured as twice
the bytes of the buffered page in its own benchmark. What followed its first
flush here was 3,415 bytes: 441 for the previews, and the whole document.
Sending each block once is first on the RFC's list of future work.

### A stream that breaks leaves a page that works

Here, if the response breaks off, the browser keeps what it has, already
hydrated, and the application fetches the rest itself.

In Analog the page is not usable until the final document is in, so there is
nothing to keep. A stream that ends without it
[replaces what was shown][runtime] with a generic error page.

### It runs in more places

This library supports Angular 19.2, 20.3, 21.2 and 22, on anything with web
`Request` and `Response`, and inside `@angular/ssr` for an app built by the
Angular CLI. Analog's renderer needs Angular 21 or later and
`node:async_hooks`, and is served by Nitro or a [custom server][custom].

## What Analog does that this library does not

These are the gaps on this side. Each says what to do about it today.

### Its first byte does not wait for the application

Analog sends the head before it starts rendering, so the browser can load the
stylesheets and scripts while the server works. Its time to first byte does
not depend on the page.

Here the first byte is the shell, and the shell is a render. In the recording
both first bytes arrived after 0.01 seconds, because this page renders at
once. A page whose first render is slow, behind a resolver or a heavy
component tree, keeps the browser waiting that long here and not in Analog.
Keep what the first render waits for short: a resolver holds the shell back
for as long as it takes.

### A block can load its data any way

Analog's response was the same with `httpResource()` as with `HttpClient`. It
does not follow requests at all: it waits for the application to be stable.

Here the renderer only follows `HttpClient`. A `resource()`, and so an
`httpResource()`, counts as pending work in Angular, and the shell waits for
pending work: such a page is sent in one piece when its data is in. It is
complete, but not streamed. Load a block's data with
`inject(HttpClient).get()`, as
[Making something stream](making-something-stream.md#2-load-its-data-with-httpclient)
does, or follow other data by hand with
[`SERVER_REQUEST_TRACKER`](making-something-stream.md#data-from-outside-httpclient).

### Crawlers get a complete document

Analog serves a crawler, recognised by its user agent, the buffered render:
the whole page with its data and a title or meta tag set while rendering, and
no scripts needed to read it.

Here crawlers get the same stream as everyone. One that runs scripts sees the
page as a reader does. One that does not keeps the shell: each block's loading
state, and a title set from data that streams in later is missing.
[Crawlers and metadata](production.md#crawlers-and-metadata) says what to put
in the shell for them.

### A block can sit anywhere in a template

Analog's own [example app][example] has its blocks at the root of a
component's template, with no element around them. Here a block has to sit
[directly inside an element](making-something-stream.md#rules): one at the
root of a template or of an `@if`, in an `<ng-container>` or in projected
content is left to the browser, with a warning in the server's log. Wrapping
it in a `<div>` is the whole fix, but it is a rule to know.

### Hydration is Angular's own

The document Analog hydrates is the one a buffered render would have made, so
every `hydrate` trigger behaves as it does on a page that was not streamed.

Here a block's markup is replaced after Angular has started, and that has
edges, listed under
[Caveats and limitations](../reference/limitations.md#streaming): a
`hydrate on viewport` block only takes markup that arrives before Angular
starts or after its trigger has fired, and `hydrate when` is rendered by hand
on the server.

### It reaches less far into Angular

Analog adds two small edits to `@angular/core` at build time, and warns when
the code they look for has moved. This library patches nothing but calls more
of Angular's private API, on the server and in the browser.
[How each gets into Angular](#how-each-gets-into-angular) has both sides.

## How each gets into Angular

Neither can do this with Angular's public API, and they reach in at different
places.

Analog changes Angular at build time. A [Vite plugin][plugin] rewrites
`@angular/core` in the server build: it adds a call where a `@defer` block
finishes rendering, and exposes the function that collects a block's nodes.
The document at the end comes from Angular's own renderer, and the browser
hydrates it with Angular's own, untouched hydration. That is a small surface:
if the code the plugin looks for has moved, it warns and the app renders
buffered.

This library patches nothing, and leans on more. On the server it calls
private Angular APIs to annotate the application again on every flush and cut
out the blocks that changed. In the browser, `provideStreamHydration()`
rewrites the hydration data Angular holds for a block whose markup was
replaced. That is what lets a block hydrate before the response has ended. It
is also why the supported Angular versions are the ones
[a check in CI proves](../getting-started/installation.md#compatibility).

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
| The first flush                     | The head, then each block as a preview                                  | The shell: the page, with each block in its loading state                             |
| What a flush waits for              | A block finishing its render, then the application being stable         | An `HttpClient` request finishing                                                     |
| When the page hydrates              | At the end, all of it                                                   | The shell at once, each block when its data arrives                                   |
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
  time is identical". Both responses above ended after 0.9 seconds.

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
