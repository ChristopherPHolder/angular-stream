# Baseline SSR documents

> **Historical.** Captured from the buffered renderer, before streamed hydration
> landed. Each route was then one document sent in one piece. Responses are now a
> shell followed by chunks (see [How it works](../../../apps/docs/src/content/concepts/walkthrough.md) in the docs),
> so the offsets and sizes below no longer describe what the Worker sends. They
> stay here as the "before".

Captured from a production build of the Worker setup at the time:

```bash
npm run build
npm run preview                       # http://localhost:4173
curl -s http://localhost:4173/list/category/popular > list-category-popular.html
curl -s http://localhost:4173/detail/movie/550      > detail-movie-550.html
node anatomy.mjs list-category-popular.html
```

`preview` serves the Worker through workerd, so these are the real SSR responses,
not dev-server output. Note: the preview server sends them uncompressed — the
brotli figures below are computed offline at `-q 11`, which is what Cloudflare
would do on the wire.

## Sizes

| route                    | raw     | brotli -q11 | fits one 14.6 KB flight?   |
| ------------------------ | ------- | ----------- | -------------------------- |
| `/list/category/popular` | 81,866  | **11,667**  | yes, whole document        |
| `/detail/movie/550`      | 135,935 | **17,155**  | no — spills into a 2nd RTT |

## Anatomy of `/list/category/popular`

Byte offsets, and the brotli size of the prefix up to that point:

| raw offset | brotli prefix | landmark                                             |
| ---------- | ------------- | ---------------------------------------------------- |
| 17,971     | 3,282         | `</head>`                                            |
| 18,126     | 3,351         | `<ui-side-drawer>` begins                            |
| 30,946     | 4,077         | `</ui-side-drawer>` ends                             |
| 33,654     | 4,463         | `<div class="content">` — first visible page content |
| 33,976     | 4,569         | `<ui-movie-list>`                                    |
| 61,524     | 6,561         | ngx-fast-svg sprite container begins                 |
| 81,025     | 11,455        | `<script id="ng-state">`                             |

Block costs:

- `<head>`: 17,940 raw, of which **15,562 is 14 inline `<style ng-app-id="ng">` blocks**
  (Angular component styles). Plus 15 `modulepreload` links and one render-blocking
  `<link rel="stylesheet" href="/assets/index-bo8nfTiw.css">` (5,246 bytes on disk).
- `<ui-side-drawer>`: 12,820 raw / **~726 brotli**.
- ngx-fast-svg sprite (10 inline `<svg>` defs at the end of `<body>`): 20,236 raw /
  **~5,228 brotli** — the single largest block in the document, already last.
- `ng-state` transfer state: 621 raw.
- 506 elements, 53 comments, 49 `jsaction` attributes, 56 `ngh` attributes.
- `<!--nghm-->` integrity marker present; no `ng-event-dispatch-contract` script
  (this Vite/Worker setup does not inline one — relevant to event replay).

TTFB locally: ~55 ms warm, ~200 ms first hit (list), ~106 ms (detail).

## What this says about the hoist-and-reinject idea

For the list route it does not pay. The **entire** document is 11.7 KB brotli, already
inside a single initial congestion window, and the first visible content starts at
~4.5 KB. Hoisting the side drawer — the best candidate, 15.7% of raw bytes — moves that
to ~3.8 KB. Both are in flight one. Zero round trips saved.

The detail route is the case worth attacking: 17.2 KB brotli overflows the first window.

Two things matter more than byte order here:

1. **15.5 KB of inline component CSS in `<head>`** is 3.3 KB brotli of pure head weight
   before a single byte of content, and the global stylesheet is still a render-blocking
   separate request. There is no critical-CSS inlining in this Vite setup (Angular CLI's
   beasties is gone), so FCP waits on `/assets/index-bo8nfTiw.css` regardless of how the
   HTML is ordered.
2. **82–136 KB of raw HTML to parse, style and lay out** before first paint. That is CPU,
   not transfer, and deferring the drawer and the SVG sprite would cut it meaningfully
   even though it saves no round trip.
