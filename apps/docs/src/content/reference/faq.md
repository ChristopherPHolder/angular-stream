Short answers, each with the page that has the long one.

## Doesn't Angular stream on its own?

No. Angular renders a page on the server and sends it whole, once every
request it made has answered. It has incremental hydration, which this builds
on, but nothing that sends a part of the page later. See
[Does Angular support streaming SSR?](../concepts/angular-streaming-ssr.md).

## How is this different from incremental hydration?

Incremental hydration decides when a part of the page becomes interactive in
the browser. The part's HTML is still in the page the server sent whole.
Streaming decides when that HTML arrives: the server sends the rest of the page
first, and the part when its data is there. This uses the first to do the
second; see
[What Angular has instead](../concepts/angular-streaming-ssr.md#what-angular-has-instead).

## Do I need the Angular CLI?

No. With the Angular CLI, `@angular/ssr` stays in charge and its server routes
stream. Without it, the app builds with Vite and ngp, on any of the other
runtimes, and gives up `@angular/ssr`'s server routes and status codes. See
[Requirements](../getting-started/installation.md#requirements).

## Which Angular versions does it support?

19.2, 20.3, 21.2 and 22, each from the patch the
[compatibility table](../getting-started/installation.md#compatibility) names,
zoneless and with Zone.js. The ngp setups build Angular `22.3.0-rc.0` only.

## Is it ready for production?

Judge it on what has been checked:

- **No release is out yet**; see [Releases and upgrading](releases.md).
- **The hosted platforms were checked locally**, with each platform's own
  tooling or a stand-in for it, not on a real deployment. Each runtime's page
  says what was checked.
- **ngp is a prototype**, pinned to an Angular release candidate. The Angular
  CLI setup doesn't use it.
- **It uses private Angular APIs**, and supports only the versions CI checks.

[Going to production](../guides/production.md) has what to settle first.

## Does it hurt SEO?

A crawler that runs scripts, as Google's does, sees the whole page once the
stream ends. One that doesn't sees the shell, with each block's loading state.
Titles and meta tags have to be set before the shell goes out. See
[Crawlers and metadata](../guides/production.md#crawlers-and-metadata).

## Can I cache a streamed page?

Not as it stands: streamed responses are sent with `Cache-Control: no-store`.
Cache the data the page waits for instead, and the browser build as usual. See
[Caching](../guides/production.md#caching).

## What if my API is slow, or down?

Slow is what this is for: the rest of the page is there at once, and the slow
part follows. Down is an error state in the block, and the browser tries the
request again itself. See
[When a request fails](../guides/making-something-stream.md#when-a-request-fails).

## Does the data have to come through `HttpClient`?

To stream without extra code, yes: the renderer follows `HttpClient`'s
requests. An `httpResource()` holds the shell back instead, and a plain
`fetch()` or an SDK needs a few lines to stream. See
[Data from outside `HttpClient`](../guides/making-something-stream.md#data-from-outside-httpclient).

## Why does my page arrive all at once?

Something kept it from streaming: a block that isn't set up to stream, data
that doesn't come through `HttpClient`, compression, or a proxy. See
[The page arrives all at once](../guides/debugging.md#the-page-arrives-all-at-once).

## Can I use `@angular/service-worker`?

With the Angular CLI, yes: it is the CLI's build step, and `@angular/ssr` serves
the app as usual. The ngp setups have no such build step. An experimental
worker of this project's own renders the pages in the browser instead; see
[Service Worker](../guides/service-worker.md).

## Does it work with i18n?

With the Angular CLI, a localized build streams: `withStreaming()` provides
`LOCALE_ID` and sets `Content-Language` for each locale, as `@angular/ssr`
does. See the [API reference](angular-ssr.md#withstreaming). The ngp setups
haven't been checked with a localized build.

## How is this different from Analog's streaming?

Both stream `@defer` blocks with a `hydrate` trigger, and differ in what a
flush waits for, where a block lands and what crawlers get.
[Analog's streaming SSR, compared](../guides/analog-streaming-ssr.md) sends one
page through both.
