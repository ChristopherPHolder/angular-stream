# Out-of-order SSR: getting first paint into the first flight

Research notes and candidate approaches. Nothing here is implemented yet.

## 1. The idea

Today Angular SSR produces one buffered HTML document and the browser has to receive
(and parse) it in document order. Anything visible that sits late in that document is
painted late.

The proposal: after the server render completes, **take the parts of the document that are
not needed for first paint out of their place in the byte stream**, emit a tiny placeholder
where they were, append the real markup at the end of the response wrapped in an inert
`<template>`, and have a small classic inline script put each one back where it belongs
while the document is still parsing. The goal is that the first ~12 KB on the wire is
nothing but the markup that paints.

This is Facebook's BigPipe pagelet model, and the same transport trick React's Fizz runtime
uses for Suspense boundaries (`<template>` payload + `$RC()` reveal script) and Astro uses
for server islands.

## 2. Why this can work at all (the keystone)

The build emits browser bundles as **module scripts**:

```html
<body><script type="text/javascript" id="ng-event-dispatch-contract">…</script>
  <app-root></app-root>
<script src="polyfills.js" type="module"></script><script src="main.js" type="module"></script></body>
```

(`dist/angular-stream/server/index.server.html`)

Module scripts are deferred by definition — they do not execute until parsing is finished.
Classic inline scripts execute synchronously during parse. So every re-injection script we
append runs **before Angular bootstraps**. By the time hydration starts, the DOM is already
back in its original shape and Angular never knows the document arrived out of order.

That single ordering fact is what makes this approach viable instead of a hydration nightmare.

## 3. Sizing the prize honestly

### 3.1 What "the first 12 KB" actually is

RFC 6928 sets the TCP initial congestion window to `min(10*MSS, max(2*MSS, 14600))` — the
familiar ~14.6 KB. Some CDNs ship larger initial windows (a 2018 measurement study found
most under 50 segments, with outliers up to 100), and `initcwnd` is settable per route on
Linux, so 14.6 KB is a **floor for a cold connection**, not a universal ceiling. BBR changes
how the window grows after the first flight, not the first flight itself.

Three corrections to the "10–12 KB" intuition:

- **The budget is compressed bytes.** With brotli on HTML, 12 KB on the wire is roughly
  50–80 KB of markup. That is a much more comfortable budget than it sounds — and it means
  the win has to be measured post-compression, not on raw HTML length.
- **Response headers and TLS record framing eat into it.** Budget ~11–12 KB for the body.
- **Repeat visits and warm connections have a bigger window already.** This optimisation
  targets the cold first view.

### 3.2 The part that is easy to get wrong

Reordering only pays when there are bytes that are **early in document order but not needed
for first paint**. Content that is already late in the document (the footer, list items
20–40) is already late on the wire — deferring it changes nothing.

In this app the obvious candidate is real and large: `app-shell.component.html` renders
`<ui-side-drawer>` — logo, three category links, and one `<a>` + inline SVG per genre (~19
of them) — **before** `<div class="content-wrapper">` and the `<ng-content />` where the page
actually lives. On mobile the drawer is closed and invisible. Every byte of it, including
every inlined `fast-svg` icon, currently precedes the first byte of visible content.

Other members of the same family: the account dropdown markup, hidden dialogs, `<noscript>`
blocks, inline icon sprites.

**So step zero is measurement, not code** (§8). If the answer is "the fold completes at byte
9 KB compressed", the whole exercise is moot and the money is elsewhere.

### 3.3 The second, less obvious win

Even where bytes are neutral, deferring shrinks the DOM the browser must parse, style and
lay out before the first frame. On a low-end phone that pre-FCP CPU work is frequently the
real bottleneck, not transfer. Worth measuring separately.

### 3.4 Render-blocking CSS will dominate if we let it

`<link rel="stylesheet" href="styles.css">` in `<head>` is render-blocking: no HTML ordering
trick beats a stylesheet round trip. Production builds have `optimization.styles.inlineCritical`
on by default, so Angular (via beasties) inlines critical CSS into the head and defers the
sheet. That inlined CSS is itself several KB of our 12 KB budget. See §7 for the interaction
between critical-CSS extraction and hoisting — it is a real trade-off, not a detail.

## 4. Where this repo stands

- Angular 21.1.6, `@angular/ssr` 21.1.5, Fastify 5, `RenderMode.Server` for `**`
  (`src/app/app.routes.server.ts`).
- `src/server/ssr.plugin.ts` delegates everything to `AngularNodeAppEngine`.
- `@angular/ssr` already returns a `ReadableStream` response, but it enqueues exactly one
  chunk — the whole document — after critical CSS inlining
  (`packages/angular/ssr/src/app.ts`, the `// Use a stream to send the response before
  finishing rendering…` block). Headers flush early; the body does not.
- Angular core has **no** streaming SSR and it is not on the public roadmap. Analog has an
  open RFC (#2526) for opt-in streaming SSR; that is community, not core.
- There is prior art in this repo's history: `4aed0e8` and the reverted `impl slice 2..6`
  commits built a custom buffered renderer plus a `streamBoundary` directive, a request-scoped
  boundary sink, and a `<template>`+commit-comment wire protocol with a `MutationObserver`
  runtime. Those commits are a good source of design detail and should be re-read before
  writing code — especially the framing rules and the "observe the trailing comment, not the
  template start tag" insight.

**Important difference from that earlier POC:** that work was about *time* (flush the shell
before async data resolves). This proposal is about *byte order* (the render is already
finished; we just send it in a better sequence). They are orthogonal and can share one
boundary protocol, but this one is strictly simpler and can land first.

## 5. Constraints Angular imposes (verified against source)

All paths below are in `opensrc/repos/github.com/angular/angular/packages`.

| Constraint | Where | Consequence |
|---|---|---|
| Hydration locates nodes by **navigation paths** (`f` = firstChild, `n` = nextSibling) from the component host, or from `document.body` for projected/portal nodes | `core/src/hydration/node_lookup_utils.ts` (`calcPathForNode`, `calcPathBetween`), `interfaces.ts` | Restoration must be **structurally exact**, including whitespace text nodes and comment anchors. Node counts and order must match the moment of serialization. |
| `verifySsrContentsIntegrity` throws `NG0507` unless an `<!--nghm-->` comment is a child of `<body>` | `core/src/hydration/utils.ts` | The marker is inserted as `body.firstChild` during SSR — it must stay in the critical chunk. |
| Transfer state is a `<script id="<appId>-state" type="application/json">` appended at the very bottom of `<body>`, deliberately after the CLI script tags | `platform-server/src/transfer_state.ts` | Our deferred payloads have to be placed with this in mind; appending before `</body>` is fine because module scripts are deferred. |
| Event replay: the CLI inlines `ng-event-dispatch-contract` as the **first child of body**, and SSR inserts `__jsaction_bootstrap(document.body, …)` right after it | `platform-server/src/utils.ts` (`insertEventRecordScript`), built `index.server.html` | Delegation is installed on `document.body` inside the critical chunk, so `jsaction` attributes inside deferred content work the moment it is injected. There is a short window where a click on not-yet-injected content is lost — acceptable, it is not on screen. |
| `prepareForHydration()` (annotation) runs **before** `BEFORE_APP_SERIALIZED` callbacks, which run before `platformState.renderToString()` | `platform-server/src/utils.ts` (`renderInternal`) | `BEFORE_APP_SERIALIZED` is a **public token** and is the correct hook: at that point the DOM is fully hydration-annotated but not yet serialized. |
| `@defer` blocks get comment anchors (`<!--ngh=<id>-->`) and serialized hydrate triggers | `core/src/hydration/annotate.ts`, `core/src/hydration/interfaces.ts` | Incremental hydration boundaries are a candidate source of "not critical" markers (§6, A2). |

## 6. Candidate approaches

### A. Post-render hoist and re-inject (the proposal) — recommended

Render fully, then in `BEFORE_APP_SERIALIZED` detach marked subtrees from the domino
document, leave an inert placeholder, and append the payloads at the end of `<body>`.

Pros: no change to render timing, no streaming machinery, compression and `Content-Length`
stay intact, works through buffering CDNs and proxies (byte *order* survives buffering), and
is trivially switchable per route/UA.
Cons: does not improve TTFB at all; only byte ordering.

Sub-variants by how "non-critical" is marked:

- **A1 — explicit directive.** `<ui-side-drawer streamDefer="drawer">`. Predictable, reviewable,
  no surprises. Start here.
- **A2 — derive from `@defer (hydrate on viewport|idle|interaction)`.** Those blocks already
  declare "not needed immediately" and already carry ids and anchors. Zero new annotation
  vocabulary, and it ties the byte-order story to the existing hydration story. Attractive
  second step.
- **A3 — budget-enforced tail cut.** Walk the serialized document, and once the compressed
  budget is spent, hoist everything after the cut. Needs the cut to land at a node boundary
  we can reconstruct; cutting mid-subtree means the payload has to be *appended into* a
  located parent rather than replacing a placeholder. Possible, but keep it as future work.

### B. A + true async streaming

Flush the critical chunk before the render is finished, then stream payloads as boundaries
resolve. This is the reverted POC plus this proposal. Improves TTFB as well as ordering.

Cons: needs the custom renderer (losing `AngularNodeAppEngine`, and with it prerender/redirect/
status-code handling unless re-implemented); per-chunk compression flushes cost ratio; no
`Content-Length`; buffering intermediaries can erase the benefit; error handling after the
headers are committed is genuinely hard. Earn this after A proves the ordering win is real.

### C. `@defer (hydrate on …)` only — the baseline to beat

Angular's incremental hydration already reduces *JavaScript* work and shrinks the hydration
critical path. It does **not** change HTML byte order; the dehydrated markup still ships in
place. Worth measuring as the honest baseline, because if it gets most of the win with zero
custom infrastructure, that matters.

### D. Separate-request islands (Astro `server:defer` model)

Ship a placeholder, fetch each island's HTML over its own HTTP request, swap it in. Simplest
to reason about and cacheable independently; but it costs an extra round trip per island and
the content arrives after first paint rather than within the same response. Strictly worse
for our stated goal; included for completeness. (Note the recent reflected-XSS advisory on
Astro's `/_server-islands/` endpoint as a reminder that a public re-render endpoint is new
attack surface.)

### E. Shell-only SSR + client fetch

Rejected: gives up SSR content for the deferred regions entirely, hurts LCP and SEO.

### Comparison

| | Improves byte order | Improves TTFB | Needs custom renderer | Survives buffering proxy | Extra RTT |
|---|---|---|---|---|---|
| A | yes | no | no | yes | no |
| B | yes | yes | yes | no | no |
| C | no | no | no | yes | no |
| D | yes | no | no | yes | yes, per island |

## 7. Design sketch for A

### Marking

A server-only directive that stamps an identity attribute on its host:

```ts
@Directive({ selector: '[streamDefer]' })
export class StreamDeferDirective {
  readonly id = inject(new HostAttributeToken('streamDefer'));
  // host: { '[attr.data-sd]': 'id' }
}
```

Ids restricted to `^[A-Za-z][A-Za-z0-9_-]*$` so they can be interpolated into markers without
an encoding layer — same rule the earlier POC settled on.

### Extraction (`BEFORE_APP_SERIALIZED`)

```ts
{
  provide: BEFORE_APP_SERIALIZED,
  multi: true,
  useFactory: () => {
    const doc = inject(DOCUMENT);
    const sink = inject(DEFERRED_PAYLOAD_SINK); // request-scoped, provided per platform
    return () => {
      for (const host of doc.querySelectorAll('[data-sd]')) {
        const id = host.getAttribute('data-sd')!;
        const placeholder = doc.createElement('template');
        placeholder.setAttribute('data-sd-ph', id);
        host.replaceWith(placeholder);
        sink.add(id, host.outerHTML);
      }
    };
  },
}
```

`<template>` as the placeholder rather than a comment or a custom element: it is inert, it is
allowed in table and `<select>` contexts where an unknown element would be foster-parented,
and it is addressable with a plain attribute selector.

### Framing

Appended immediately before `</body>`, after the module script tags:

```html
<template data-sd-payload="drawer">…original outerHTML…</template><script>$sd("drawer")</script>
```

with `$sd` defined once in the critical chunk:

```js
function $sd(id){
  var p=document.querySelector('[data-sd-payload="'+id+'"]'),
      h=document.querySelector('[data-sd-ph="'+id+'"]');
  if(p&&h){h.replaceWith(...p.content.childNodes);p.remove();}
  document.currentScript.remove();
}
```

`replaceWith` removes the placeholder and inserts the payload's children in order, so the
resulting structure is byte-for-byte the structure Angular annotated — including whitespace
text nodes, because they are inside `template.content`.

For approach A alone, a single trailing script processing every payload is smaller than one
script per payload. Keep the per-payload form anyway: it is what B will need, and the size
difference is noise.

### Where the transform runs

`BEFORE_APP_SERIALIZED` runs before beasties' critical-CSS extraction in `@angular/ssr`. That
has a consequence worth deciding deliberately:

- **Hoist before critical CSS (default if we use `BEFORE_APP_SERIALIZED`):** beasties only
  sees the critical chunk, so the inlined CSS is smaller and the head is cheaper — more of
  the budget left for markup. Risk: injected content may paint unstyled for the moment
  between injection and `styles.css` arriving.
- **Hoist after critical CSS (post-process the final HTML string in the Fastify layer):**
  inlined CSS covers the deferred content too, no flash, but a fatter head eating the budget
  we are trying to protect.

Recommendation: start with hoist-before, watch for FOUC on the deferred regions, and fall
back to hoist-after if it is visible.

## 8. Measure before building

Step zero, on a production build, for the two routes that matter (`/list/category/popular`
and a movie detail page):

1. Capture the SSR HTML: `curl -s localhost:4000/list/category/popular > baseline.html`
2. Find the byte offset where the above-the-fold markup is complete (the end of the first
   screenful of `<div class="content">`), and the offset where `<ui-side-drawer>` ends.
3. Compress the prefix at each offset (`brotli -q 11`) and compare against ~11–12 KB. The
   difference between "compressed bytes before the fold completes today" and "…after hoisting
   the drawer" **is the entire value of this project**. If it is under a kilobyte, stop.
4. Independently: count DOM nodes before the fold with and without the drawer, as the proxy
   for the pre-FCP parse/style/layout saving (§3.3).

Then, for the implementation itself: A/B behind a request flag (header or query param) on one
build so FCP/LCP can be compared on identical bytes-per-route, throttled to a cold 4G profile
with a 150 ms RTT. Chrome's FCP/LCP entries via `PerformanceObserver` plus WebPageTest
filmstrips; Lighthouse alone will be too noisy for a one-to-two-RTT difference.

## 9. Risks and open questions

- **CLS.** Deferred content that is in normal flow above the fold will shift layout when it
  is injected. Only defer content that is off-screen, hidden, or has reserved space. The
  drawer qualifies; a hero image would not.
- **No-JS clients and non-executing crawlers** never see deferred content. Googlebot executes
  JS; many social scrapers and some crawlers do not. Mitigation: never defer SEO-relevant or
  OG-relevant content, and/or bypass the transform entirely for known crawler UAs. A
  `<noscript>` duplicate is not a mitigation — it puts the bytes back on the wire for everyone.
- **CSP.** Inline scripts need the nonce. Angular has `CSP_NONCE`; the injected runtime and
  every `$sd(...)` script must carry it.
- **i18n / ICU blocks.** Hydration stores i18n node data by index
  (`core/src/hydration/i18n.ts`). Exact restoration should be safe, but do not defer regions
  inside i18n blocks until it is explicitly tested.
- **Nested boundaries.** A deferred region containing a `@defer` block, or a deferred region
  inside another, needs payloads applied in a well-defined order. Restrict to non-nested
  boundaries in the first slice; the earlier POC deliberately scoped nesting out too.
- **Prerender / `RenderMode.Prerender`.** `@angular/ssr` takes a different code path for
  prerender (no stream, no cache). Decide whether hoisting applies to static files at all —
  it still helps there, but keep the first slice to `RenderMode.Server`.
- **Compression.** Approach A keeps one buffered body, so brotli ratio and `Content-Length`
  are unaffected. This is a concrete argument for doing A before B.
- **Hydration mismatch detection.** `NG0500`-series errors and the `nghm` integrity error are
  the canary. Any slice must be validated with hydration debugging on and zero mismatches, on
  both routes, with and without the drawer open.
- **`@angular/ssr` ownership.** Approach A can likely live entirely in `app.config.server.ts`
  plus a small Fastify-side response transform, keeping `AngularNodeAppEngine`. Confirm that
  before assuming it; if the payload append has to happen inside the engine's stream, we may
  need to own the renderer earlier than planned.

## 10. Suggested slicing

Each slice ends with a manual checkpoint; do not start the next until it passes.

1. **Measure** (§8). Produce the numbers. Decide go/no-go on real data.
2. **Marker + extraction, no transport.** Hoist the drawer in `BEFORE_APP_SERIALIZED`, append
   the payload before `</body>`, inject with a single trailing inline script. Checkpoint:
   page looks identical, zero hydration errors, drawer opens and the genre links route.
3. **Per-payload framing + runtime.** Move to the `$sd(id)` protocol, nonce support, multiple
   boundaries, validation and a clear `console.error` on malformed payloads.
4. **Measure again** against slice 1's baseline. Report FCP/LCP deltas honestly, including the
   case where the drawer is the only win and it is small.
5. **A2:** derive boundaries from `@defer (hydrate on …)` blocks instead of a bespoke directive.
6. **Only then** consider B (true streaming), reusing the boundary protocol and the reverted
   POC's sink/renderer design.

## 11. Decisions I need from you

- Is TTFB in scope, or is this purely about byte ordering for now? (Determines whether we aim
  at A or go straight for B and its custom renderer.)
- Bespoke `streamDefer` directive first (A1) or go straight to deriving boundaries from
  `@defer (hydrate …)` (A2)?
- Acceptable to lose deferred content for non-JS crawlers, or do we need a UA bypass from
  day one?

## Sources

- [RFC 6928 — Increasing TCP's Initial Window](https://www.rfc-editor.org/rfc/rfc6928.html)
- [Demystifying TCP Initial Window Configurations of CDNs](https://arxiv.org/pdf/1902.08937)
- [CWND (Congestion Window) — CDN glossary](https://cdncertified.com/glossary/cwnd-congestion-window/)
- [How React streams UI out of order](https://inside-react.vercel.app/blog/how-react-streams-ui-out-of-order)
- [BigPipe: Pipelining web pages for high performance (ports and background)](https://github.com/nerdmind/bigpipe)
- [BigPipe streaming for the Play Framework](https://www.ybrikman.com/blog/2015/06/30/ping-play-big-pipe-streaming-for-play-framework/)
- [Astro Server Islands](https://astro.build/blog/future-of-astro-server-islands/)
- [Astro server islands docs](https://docs.astro.build/it/guides/server-islands)
- [Server-Side Streaming SEO in 2026: A Cross-Framework Study (Angular has no streaming SSR)](https://unhead.unjs.io/learn/research/streaming-head-performance)
- [Angular roadmap](https://angular.dev/roadmap)
- [Analog RFC #2526 — opt-in streaming SSR](https://github.com/analogjs/analog/issues/2526)
