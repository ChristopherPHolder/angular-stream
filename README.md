# angular-stream

A real Angular application — a TMDB-backed movie browser — server-side rendered
on the Cloudflare Workers runtime, built with Vite.

Most Angular SSR guides target a Node server and the Angular CLI. This repo
takes the other path: Angular compiled by [ngp][ngp] through Vite, with the
server bundle running directly in workerd, static assets served by Cloudflare's
`ASSETS` binding, and every navigation falling through to the rendering Worker.

## Stack

| Concern   | Choice                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Framework | Angular 22 (standalone, zoneless, signal-based APIs)                        |
| Compiler  | [`@push-based/vite-plugin-ngp`][ngp] — Angular's Rust/TS preprocessor       |
| Bundler   | Vite 8 (Rolldown)                                                           |
| SSR       | Streamed, with hydration starting before the response ends; see below       |
| Host      | Cloudflare Workers via [`@cloudflare/vite-plugin`][cfvite]                  |
| State     | [`@rx-angular/state`](https://www.rx-angular.io/)                           |
| Icons     | [`@push-based/ngx-fast-svg`](https://github.com/push-based/ngx-fast-svg)    |
| Data      | TMDB REST API (v3 + v4)                                                     |

[ngp]: https://github.com/push-based/vite-plugin-ngp
[cfvite]: https://developers.cloudflare.com/workers/vite-plugin/

## Requirements

ngp ships an unofficial build of Angular's preprocessor, which constrains the
toolchain more than a normal Angular app:

- **macOS or Linux (glibc), x64 or arm64.** Elsewhere — Alpine included — set
  `engine: 'wasm'` in the `ngp()` options. Windows is untested outside WSL 2.
- **Node 26.**
- **Every `@angular/*` package pinned to exactly `22.3.0-rc.0`.** ngp imports
  private APIs from `@angular/compiler-cli`, so no other version works. This is
  also why `.npmrc` sets `legacy-peer-deps`: npm never matches a prerelease
  against a plain range like `>=22.0.0`, so the Angular libraries' peer ranges
  fail to resolve even though they are compatible.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs the Worker in workerd, so SSR behaves as it does in
production. The first install prompts to approve native install scripts
(`esbuild`, `workerd`, `@parcel/watcher`, `fsevents`); they are already recorded
under `allowScripts` in `package.json`.

| Script            | What it does                                         |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Vite dev server, Worker in workerd                   |
| `npm run build`   | Client bundle to `dist/client`, Worker to `dist/ssr` |
| `npm run preview` | Serves the built output in workerd                   |
| `npm run deploy`  | Builds, then `wrangler deploy`                       |
| `npm run cf-typegen` | Regenerates `worker-configuration.d.ts`           |

### TMDB credentials

`src/environments/environment.ts` ships with a working read-only TMDB key. To
use your own, copy `environment.local.example.ts` to `environment.local.ts`
(gitignored) and fill in `tmdbApiKey` and `tmdbApiReadAccessKey`.

## Continuous deployment

`.github/workflows/ci.yml` builds every pull request and every push to `main`,
and deploys to Cloudflare Workers on pushes to `main` only. The build step also
runs ngp's type check and the bundle budgets, so a type error or an oversized
bundle fails CI before anything ships.

Two repository secrets are required for the deploy step:

| Secret                  | Where it comes from                                         |
| ----------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → My Profile → API Tokens, using the **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID          |

Until they are set, pull requests still build; only the deploy step fails.

Deploying by hand is `npm run deploy`. Either way `wrangler` reads the config
that `vite build` generated (`dist/ssr/wrangler.json`, reached through
`.wrangler/deploy/config.json`) rather than the `wrangler.jsonc` at the repo
root, whose `main` points at TypeScript source.

## How the pieces fit

**`index.html` is the template, not the page.** `wrangler.jsonc` sets
`assets.html_handling: "none"`, so the asset server matches only exact file
paths. `/assets/*` and `/favicon.ico` are served directly; every navigation
falls through to the Worker.

**`src/worker.ts`** fetches `/index.html` through the `ASSETS` binding and hands
it to the renderer. In dev that binding is backed by the Vite dev server, so the
template already carries Vite's transforms.

**`src/server/streaming/`** is the renderer the Worker uses: it sends a
hydratable shell as soon as the route's structure exists and streams the rest.
See [Streamed hydration](#streamed-hydration).

**`src/main.server.ts`** is the SSR contract ngp expects: a default export
`render(url, document)` resolving to HTML. The Worker only falls back to it when
the streaming renderer fails before its first byte. `ALLOWED_HOSTS` must list
every hostname the Worker answers for, or the request is rejected.

**`src/app/app.config.server.ts`** swaps in a Workers-safe SVG strategy. The
default one touches `window` and fetches over HTTP; icons are instead inlined
into the server bundle from `public/assets/svg-icons/*.svg?raw` so the real
`<svg>` lands in the SSR HTML and hydrates from the DOM.

**`vite.config.ts`** is just `ngp()` and `cloudflare()`. The Cloudflare plugin
owns the `ssr` environment and runs it in workerd, so ngp's own `ssr` option
stays off. ngp still compiles the Worker with its server compiler and links
Angular libraries in that environment's dependency pre-bundle.
`optimizeDeps.entries` points dependency discovery at `index.html` only, so it
doesn't scan HTML files elsewhere in the repo.

## Streamed hydration

A page request is answered in pieces, and the browser hydrates each piece as it
arrives instead of waiting for the last one:

1. **Shell.** The server bootstraps, waits for the route and its `@defer` blocks
   to exist — not for TMDB — and sends that state, annotated for hydration, with
   the entry script at the end marked `async`. The browser loads Angular and
   hydrates the shell while the response is still open.
2. **Chunks.** Each time a request finishes and the application has rendered the
   result, the server sends every `@defer` block that changed: its markup in a
   `<template>`, then an inline script carrying the block's hydration data and
   the transfer state the change came from. The script swaps the markup in front
   of the block's anchor comment, whether or not Angular is running yet.
3. **Hydration.** The block hydrates against the streamed markup when its
   trigger fires. Nothing is fetched twice: a request the server is already
   making is held back in the browser until its response arrives on the stream.

### Making something stream

Put it in a `@defer` block with a `hydrate` trigger, directly inside an element:

```html
<article>
  @defer (on immediate; hydrate when listReady()) {
    <ui-movie-list [movies]="movies$" />
  }
</article>
```

Angular leaves such a block's markup alone until the trigger fires, which is
what lets the server replace it underneath a running application. Everything
outside a block is the shell: if it changes after the shell was sent, the client
renders the change itself from the streamed data.

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

### Where things live

| File | Role |
| --- | --- |
| `src/server/streaming/streaming-angular-renderer.ts` | The response: shell, then a flush per finished request |
| `src/server/streaming/hydration-stream.ts` | Re-annotates the app each flush and cuts out the blocks that changed |
| `src/server/streaming/defer-blocks.ts` | Renders `hydrate` blocks on the server between change detection passes |
| `src/server/streaming/stream-runtime.ts` | The inline script in the shell that applies chunks |
| `src/app/streaming/stream-hydration.ts` | Keeps Angular's hydration data, block registry and HTTP in step with the stream |
| `src/app/streaming/stream-protocol.ts` | The wire format shared by all of the above |

### Caveats

- **It leans on Angular internals**: the layout of serialized hydration data,
  `ɵannotateForHydration`, the dehydrated block registry, and `DeferBlockFixture`'s
  way of rendering a block. One more reason for the exact version pin.
- **`hydrate when` is rendered by hand on the server.** Angular renders it during
  a template update, which throws `NG0600` from the second request on if the
  component has signal queries. The buffered fallback cannot work around that, so
  it renders without incremental hydration and leaves `@defer` blocks to the
  client.
- **`hydrate on viewport`** blocks only take streamed markup that arrives before
  Angular starts, or after the trigger has fired; its observer cannot follow
  replaced elements.
- **`hydrate on hover | interaction`** need Angular's event-dispatch contract
  script, which this build does not inline.
- **No CSP nonce** on the inline scripts yet.
- **If the response breaks off**, the browser keeps what it has and the client
  fetches the rest itself.

## Known limitations

These come from the ngp SSR path, which deliberately does not use
`@angular/ssr`:

- **No HTTP status codes.** `render` returns HTML only, so the not-found page is
  served with `200`. Per-route render modes and `AngularNodeAppEngine` are not
  available either.
- **No prerendering, service worker, critical CSS inlining, or SRI.**
- **Inline component `styles` are plain CSS.** There is no
  `inlineStyleLanguage`; every component here uses `styleUrl`, which does go
  through Vite's Sass pipeline.
- **ngp is a prototype.** Any Angular commit can break it, hence the exact pin.

## Analytics

The Cloudflare Web Analytics beacon in `index.html` is commented out: the token
it carried belongs to a different property. Create a Web Analytics site for this
app, swap in its token, and uncomment.
