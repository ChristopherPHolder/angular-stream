Find what you see below, check it the way it says, and change what it says.
Most of it shows in two places: the server's log, where every message of the
packages starts with `[ssr]` or `[angular-ssr-stream]`, and the browser's
console, with the page loaded from a dev build.

## First checks

- **Is the inline runtime there?** In the browser console, `window.__ngs` is
  the runtime the shell carries. Without it, the page wasn't streamed: see
  [`window.__ngs` is missing](#window__ngs-is-missing).
- **Does the response stream?** Time it with `curl`, as each runtime's "Check
  that it streams" step does:

  ```bash
  curl -sN -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
  ```

  The shell comes at once, and a line for each chunk when its data is there.

- **Load the page twice.** Some problems only show once the server process has
  rendered the page before, so a single request after a restart proves little.

## The page arrives all at once

`curl` shows one line, or every line at the same moment, when the slowest
request is done. Something stopped the stream before it left the server, or on
the way.

- **Nothing on the page waits in a `@defer` block.** Only a block with a
  `hydrate` trigger, directly inside an element, whose data comes through
  `HttpClient`, is sent later. Everything else is the shell, and the shell waits
  for nothing but the route. See
  [Making something stream](making-something-stream.md).
- **Incremental hydration is off.** The server logs
  `[ssr] Incremental hydration is off, so no @defer block is streamed` in
  development. Add `withIncrementalHydration()` to `provideClientHydration()`:
  Angular 19 to 21 need it, 22 has it on by default.
- **The data doesn't come through `HttpClient`.** A `resource()` or an
  `httpResource()` counts as pending work, and the shell waits for pending work,
  so the page goes out in one piece once it is done. Use
  `inject(HttpClient).get()` for a block's data. A plain `fetch()` or an SDK
  isn't followed at all; see
  [Making something stream](making-something-stream.md).
- **The API answers before the shell goes out.** A request that finishes while
  the shell is still rendering lands in the shell, and no chunk is sent for it.
  That is correct, and fast; slow the API down to see a chunk.
- **Compression holds it.** A compressor that doesn't flush after each write
  sends the page when it is complete. Run the `curl` check with `--compressed`:
  if only that one arrives at once, see
  [Compression middleware](streaming-through-proxies.md#compression-middleware).
- **A proxy, a CDN or the platform buffers it.** Run the check against each hop,
  from the server outwards, and see
  [Streaming through proxies](streaming-through-proxies.md). On AWS Lambda, the
  Function URL has to be `RESPONSE_STREAM`; on Azure Functions, the app needs
  `app.setup({ enableHttpStream: true })`.
- **The render fell back.** If `window.__ngs` is missing as well, read the next
  section.

## `window.__ngs` is missing

The server sent a page it rendered whole. The log says why:

- **`[ssr] streaming render failed before commit, falling back`**, with the
  error after it. Streaming threw before the shell went out, and the handler
  rendered the page the ordinary way instead, with its `@defer` blocks left to
  the browser. Fix the error; it is usually one the app would throw without
  streaming too.
- **`[ssr] withStreaming(): src/main.server.ts doesn't export streamingRenderer`**
  (Angular CLI). Add
  `export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';`
  to `src/main.server.ts`.
- **No message, Angular CLI.** The route isn't rendered on the server: a
  prerendered route is a file written at build time, and a client route is
  rendered in the browser. Give it `RenderMode.Server` in
  `app.routes.server.ts`.
- **No message, on a runtime whose dev server doesn't render.** On Bun, Vercel,
  AWS Lambda, Azure Functions and Fastly Compute, `vite dev` serves the app
  client-side, and the console shows NG0505: there was no server render to
  hydrate. Build and run it; see the table under
  [Developing](../getting-started/installation.md#developing).

## A block hydrates late, or never

The chunk arrives, but the block stays inert until the end of the stream, or
for good.

- **Its trigger isn't `hydrate when`.** `hydrate on idle`, `immediate`, `timer`
  and `viewport` say nothing about data, so on a streamed page they wait for the
  end of the stream. Use `hydrate when` with the block's data:
  `hydrate when widget()`.
- **The `hydrate when` condition never turns true.** It reads what the block
  needs, not something only the browser sets.
- **`hydrate on viewport`** only takes streamed markup that arrived before
  Angular started, or after the trigger fired; see
  [Caveats and limitations](../reference/limitations.md#streaming).
- **The response broke off.** The server logs
  `[ssr] streaming render failed after commit`. The browser keeps what it has,
  and the app fetches the rest itself, so the page completes without the stream.

## A block isn't streamed, and the server warns

`[ssr] @defer block … cannot be streamed: it sits directly inside an embedded
view, an <ng-container> or projected content` means the block is the first
thing in an `@if`, an `@for`, an `<ng-container>` or projected content. Angular
counts its nodes as part of the parent's, so it can't be swapped on its own,
and it is left to the browser. Wrap the block in an element:

```angular-html
@if (show()) {
  <div>
    @defer (on immediate; hydrate when data()) {
      …
    }
  </div>
}
```

## Hydration mismatches

NG0500 to NG0503 in the console mean the DOM Angular found isn't the one it
rendered, and NG0507 that something changed the server's HTML on the way. Streaming adds one way to get there; the rest are Angular's own.

- **Text outside a block that depends on late data.** The shell is sent once.
  If it changes after that, the browser renders the change itself, and the
  server's HTML never had it. Move it into the block, or make it independent of
  the data.
- **Something rewrites the HTML on the way.** A CDN feature that minifies HTML
  or strips comments removes the comments Angular hydrates by, and the streamed
  blocks are found by them too. Turn it off for pages.
- **Angular's usual causes**, such as invalid nesting the browser repairs, or
  code that touches the DOM directly; see
  [Angular's hydration guide](https://angular.dev/guide/hydration#constraints).

## Clicks before Angular starts are lost

- **The server warns:**
  `[ssr] withEventReplay() is on, but the template has no event dispatch contract`.
  Pass `eventDispatchContract` to the handler, as each runtime's page shows.
- **The listener is inside a streamed block, and no listener in the shell has
  that event type.** Angular only records the event types the shell listens to.
  Add a listener of that type to the shell, or accept that those clicks are
  lost; see
  [Caveats and limitations](../reference/limitations.md#streaming).

## `403` or `400` for the host

- **`403`, every page.** The `Host` header isn't in `allowedHosts`. List every
  hostname the server answers for, preview deployments included (a wildcard
  such as `'*.vercel.app'` works).
- **`403` behind a proxy.** The server sees the proxy's `Host`, not the
  visitor's. List that one, or let the Node adapters read `X-Forwarded-Host`
  with `trustProxy`.
- **`400` on the Node adapters.** The `Host` header couldn't be parsed at all.
- **`400` on Angular CLI.** `@angular/ssr` doesn't know the host. List it in
  `angular.json` under `security.allowedHosts`, or in `NG_ALLOWED_HOSTS`.

## A missing page answers `200`

Outside the Angular CLI setup, the renderer has no HTTP status codes: every
page is a `200`, a not-found page included. A server that knows its routes can
set the status itself, as
[the demo's Worker](../../../../cloudflare-demo/src/worker.ts) does. With the
Angular CLI, the status is settled when the shell goes out, so set it from the
route or from a component that exists before the data. See
[Caveats and limitations](../reference/limitations.md).

A missing file under `/assets/`, such as an old chunk after a deploy, should be
a `404`, not a page: every runtime's setup does that. If yours renders a page
for it, the browser reports a script with the wrong MIME type.

## Verifying in a browser

`curl` shows the server's half. For the browser's:

1. **Use a dev build.** Angular only checks that hydrated nodes match in dev
   mode. There, `ngDevMode.hydratedNodes` counts the nodes it claimed, and a
   claimed node has `node.__ngDebugHydrationInfo__.status === 'hydrated'`. No
   errors in a production build proves very little.
2. **Load each page twice** on the same server process.
3. **Slow the data down** to see the steps apart. A fast API answers before the
   shell goes out, and nothing streams at all. Add a delay to the API, or a
   dev-only interceptor on the server that delays each request by a different
   amount.
4. **Watch the chunks land.** Run a script before any of the page's own, such
   as Puppeteer's `page.evaluateOnNewDocument()` or the DevTools Protocol's
   `Page.addScriptToEvaluateOnNewDocument`. Have it catch `window.__ngs` when
   the runtime defines it, wrap its `push` to log each chunk, and watch for its
   `sink` being set, which is when Angular took over.

[The demo](https://angular-ssr-stream-demo.chris-holder.workers.dev/) shows all
of this on a live page: `/walkthrough` steps through each flush and each
hydration, and `/inspect` logs them as they happen.
