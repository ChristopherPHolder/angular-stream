# angular-stream

Streamed server-side rendering for Angular on Cloudflare Workers, built with
Vite+. The browser starts hydrating the page while the response is still
arriving. The repo holds two apps that use it: a real TMDB-backed movie browser,
and a demo that shows each step of streamed hydration as it happens.

- **[The demo](https://angular-stream-demo.chris-holder.workers.dev/)** is the
  place to start: why a page should not wait for its slowest part, how one
  response delivers it in pieces, and a live example with the code for it.
- **[The movie browser](https://angular-stream.chris-holder.workers.dev/)** is
  the same technique on a real app.
- **[`docs/streamed-hydration.md`](docs/streamed-hydration.md)** is the long
  version, with a real response taken apart flush by flush.

Most Angular SSR guides target a Node server and the Angular CLI. This repo
takes the other path: Angular compiled by [ngp][ngp] through Vite, with the
server bundle running directly in workerd, static assets served by Cloudflare's
`ASSETS` binding, and every navigation falling through to the rendering Worker.

## Stack

| Concern   | Choice                                                                   |
| --------- | ------------------------------------------------------------------------ |
| Framework | Angular 22 (standalone, zoneless, signal-based APIs)                     |
| Compiler  | [`@push-based/vite-plugin-ngp`][ngp] — Angular's Rust/TS preprocessor    |
| Toolchain | [Vite+][vite-plus] (`vp`): Vite 8, Oxlint, Oxfmt, library packing        |
| Workspace | [Nx][nx] (task graph, cache, `affected`, release) over pnpm workspaces   |
| SSR       | Streamed, with hydration starting before the response ends; see below    |
| Host      | Cloudflare Workers via [`@cloudflare/vite-plugin`][cfvite]               |
| State     | [`@rx-angular/state`](https://www.rx-angular.io/)                        |
| Icons     | [`@push-based/ngx-fast-svg`](https://github.com/push-based/ngx-fast-svg) |
| Data      | TMDB REST API (v3 + v4)                                                  |

[ngp]: https://github.com/push-based/vite-plugin-ngp
[cfvite]: https://developers.cloudflare.com/workers/vite-plugin/
[vite-plus]: https://viteplus.dev/guide/
[nx]: https://nx.dev/

## Layout

An Nx workspace over pnpm workspaces. Apps are private and deploy as Workers;
everything under `packages/` is published to npm under `@push-based/`:

| Path                   | What                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/movies`          | The TMDB movie browser. Deployed as the `angular-stream` Worker.                                       |
| `apps/cloudflare-demo` | Streamed hydration, step by step, with no external API. The `angular-stream-demo` Worker.              |
| `packages/core`        | `@push-based/angular-stream-core`: the streaming renderer, its inline runtime and the client.          |
| `packages/cloudflare`  | `@push-based/angular-stream-cloudflare`: `createStreamingWorker()`, over the Workers `ASSETS` binding. |
| `nx.json`              | Task defaults, cache inputs and outputs, and the release group.                                        |
| `vite.config.ts`       | Workspace-wide lint (module boundaries included) and format settings.                                  |

The core is runtime-agnostic: it speaks web `Request`, `Response` and streams,
and nothing else. A runtime adapter only says how to fetch `index.html` and what
the server entry looks like; `packages/cloudflare` is a single call to
the core's `createStreamingHandler()`. More adapters (`@angular/build` +
`@angular/ssr`, Node, Fastly, …) follow the same shape.

An app needs two things:

```ts
// src/app/app.config.ts
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';

providers: [
  provideHttpClient(withInterceptors([streamHttpInterceptor /* , ... */])),
  provideClientHydration(/* ... */),
  provideStreamHydration(), // after provideClientHydration()
];

// src/worker.ts
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';

export default createStreamingWorker({
  rootComponent: App,
  config, // the server ApplicationConfig
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

Inside this repo, the apps import the packages' TypeScript source (each
package's `exports` points at `src/`) and ngp compiles it with the app, so
`dev` never waits on a package build. Published packages are built with
`vp pack` to ESM and `.d.ts`; `publishConfig` swaps `exports` over to `dist/`
when pnpm packs them. The packages carry no Angular decorators, so they need no
partial compilation and work in any Angular build.

**Module boundaries.** Each `package.json` carries Nx tags, and
`nx/enforce-module-boundaries` (run by Oxlint in `vp check`) holds them:
packages never import an app, the core (`runtime:agnostic`) never imports an
adapter, and an adapter imports only the core.

## Requirements

ngp ships an unofficial build of Angular's preprocessor, which constrains the
toolchain more than a normal Angular app:

- **macOS or Linux (glibc), x64 or arm64.** Elsewhere — Alpine included — set
  `engine: 'wasm'` in the `ngp()` options. Windows is untested outside WSL 2.
- **Node 26.**
- **pnpm.** `packageManager` in `package.json` names the version; Vite+ and
  Corepack both pick it up.
- **Every `@angular/*` package pinned to exactly `22.3.0-rc.0`.** ngp imports
  private APIs from `@angular/compiler-cli`, so no other version works. pnpm
  warns about, but accepts, the Angular libraries' peer ranges, which never
  match a prerelease.

## Getting started

```bash
pnpm install
pnpm dev          # the movie browser
pnpm dev:demo     # the demo
```

The dev server runs each Worker in workerd, so SSR behaves as it does in
production. Run one app at a time: both start workerd's inspector on port 9232,
and the second fails silently. The native install scripts pnpm blocks by
default (`esbuild`, `workerd`, `@parcel/watcher`, `fsevents`, `nx`) are allowed
under `allowBuilds` in `pnpm-workspace.yaml`.

At the root:

| Script          | What it does                                                           |
| --------------- | ---------------------------------------------------------------------- |
| `pnpm dev`      | `nx run movies:dev`                                                    |
| `pnpm dev:demo` | `nx run cloudflare-demo:dev`                                           |
| `pnpm build`    | `nx run-many -t build`: every app and package, with Nx's task cache    |
| `pnpm ready`    | `vp check` (format, lint, type-aware lint, boundaries), then the build |

Nx infers each project's targets from its `package.json` scripts, so run them
as `pnpm nx <target> <project>` (`pnpm nx build movies`), or across the
workspace with `pnpm nx run-many -t <target>` and `pnpm nx affected -t <target>`.

In each app:

| Target       | What it does                                         |
| ------------ | ---------------------------------------------------- |
| `dev`        | `vp dev`: Vite dev server, Worker in workerd         |
| `build`      | Client bundle to `dist/client`, Worker to `dist/ssr` |
| `preview`    | Builds, then serves the output in workerd            |
| `deploy`     | Builds, then `wrangler deploy`                       |
| `cf-typegen` | Regenerates `worker-configuration.d.ts`              |

In each package:

| Target      | What it does                                  |
| ----------- | --------------------------------------------- |
| `build`     | `vp pack`: ESM and `.d.ts` to `dist/`         |
| `typecheck` | `tsc --noEmit` against the strict base config |

### TMDB credentials

`apps/movies/src/environments/environment.ts` ships with a working read-only
TMDB key. To use your own, copy `environment.local.example.ts` to
`environment.local.ts` (gitignored) and fill in `tmdbApiKey` and
`tmdbApiReadAccessKey`.

## Continuous deployment

`.github/workflows/ci.yml` runs `vp check` on every pull request and every
push to `main`, then builds and type checks the projects the change affects
(`nx affected`). On pushes to `main` it deploys the affected apps; a change to
a package counts as a change to every app that uses it. `vp check` fails on
formatting, lint and boundary errors; each app build also runs ngp's type check
and the bundle budgets, so a type error or an oversized bundle fails CI before
anything ships.

Two repository secrets are required for the deploy steps:

| Secret                  | Where it comes from                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → My Profile → API Tokens, using the **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID                                            |

Until they are set, pull requests still build; only the deploy steps fail.

Deploying by hand is `pnpm nx deploy movies` (or `cloudflare-demo`). Either way
`wrangler` reads the config that `vp build` generated (`dist/ssr/wrangler.json`,
reached through the app's `.wrangler/deploy/config.json`) rather than the app's
`wrangler.jsonc`, whose `main` points at TypeScript source.

## Releasing the packages

`nx release` versions everything under `packages/` as one group: core and
adapters share a version, because they share the wire format. Versions and
changelogs come from conventional commits; tags are `v<version>`.

`.github/workflows/release.yml` runs it by hand (Actions → Release → Run
workflow), with `dry-run` on by default. It builds the packages, bumps the
versions, writes the changelogs, commits, tags, creates the GitHub release and
publishes to npm on the `next` dist-tag with provenance. The first run needs
`first-release`. It requires an `NPM_TOKEN` secret with publish rights on the
`@push-based` scope.

The packages use private Angular APIs (`ɵ`-prefixed), so their Angular peer
range is narrow (`~22.3.0-rc.0`) and every Angular minor needs a check and a
release.

## How the pieces fit

Both apps are wired the same way; paths below are relative to an app.

**`index.html` is the template, not the page.** `wrangler.jsonc` sets
`assets.html_handling: "none"`, so the asset server matches only exact file
paths. `/assets/*` and `/favicon.ico` are served directly; every navigation
falls through to the Worker.

**`src/worker.ts`** is `createStreamingWorker()` from
`@push-based/angular-stream-cloudflare`, a thin layer over the core's
`createStreamingHandler()`. It applies Angular's host guard
(`allowedHosts` must list every hostname the Worker answers for), fetches
`/index.html` through the `ASSETS` binding and streams the route into it. In dev
that binding is backed by the Vite dev server, so the template already carries
Vite's transforms. If the streaming renderer fails before its first byte, the
Worker falls back to a buffered `renderApplication`.

**`packages/core/src/server/`** is the renderer: it sends a hydratable
shell as soon as the route's structure exists and streams the rest. See
[Streamed hydration](#streamed-hydration).

**`src/app/app.config.server.ts`** is the server config handed to the Worker. In
the movie browser it also swaps in a Workers-safe SVG strategy: the default one
touches `window` and fetches over HTTP, so icons are instead inlined into the
server bundle from `public/assets/svg-icons/*.svg?raw` and the real `<svg>`
lands in the SSR HTML.

**`vite.config.ts`** is just `ngp()` and `cloudflare()`, wrapped in Vite+'s
`lazyPlugins` so `vp check` doesn't load them. The Cloudflare plugin owns the
`ssr` environment and runs it in workerd, so ngp's own `ssr` option stays off.
ngp still compiles the Worker with its server compiler and links Angular
libraries in that environment's dependency pre-bundle. `optimizeDeps.entries`
points dependency discovery at `index.html` only.

**The demo's data** comes from `DemoBackend`, an `HttpBackend` that answers
`/api/steps/*` inside the app after the delay the URL asks for. Requests still
go through `HttpClient`, its interceptors and the transfer cache, so they stream
exactly as calls to a real API would.

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

[`docs/streamed-hydration.md`](docs/streamed-hydration.md) starts with
[why](docs/streamed-hydration.md#why-stream-out-of-order): what streaming out of
order buys, and how other frameworks came to it. Then it takes a real
response apart flush by flush. It shows the HTML each flush carries, what the
page looks like after it, and when each part hydrates. It also covers the wire
format and how to verify a change.

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
outside a block is the shell, and the shell is sent once: if it changes after
that, the client renders the change itself from the streamed data, and the
change never appears in the server HTML. Text that depends on data belongs
inside a block.

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

### Debugging

- `window.__ngs` is the inline runtime. If it is missing, the Worker fell back
  to the buffered render; the server logs
  `[ssr] streaming render failed before commit`.
- Check hydration under `pnpm dev`. Angular only checks node matches in
  dev mode.
- To see the steps one at a time, run the demo (`pnpm dev:demo`). `/example`
  streams one widget and shows the code for it; `/walkthrough` and `/inspect`
  show each flush and each hydration as it happens.
- Request each page at least twice on the same server process. NG0600 from
  `hydrate when` only shows from the second request on.

More in [Verifying a change](docs/streamed-hydration.md#verifying-a-change).

### Where things live

All under `packages/core/src/`. The Cloudflare entry, `createStreamingWorker()`,
is `packages/cloudflare/src/index.ts`: the handler, with the template read from
`ASSETS`.

| File                                   | Role                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `server/handler.ts`                    | `createStreamingHandler()`: host guard, template, stream, buffered fallback     |
| `server/streaming-angular-renderer.ts` | The response: shell, then a flush per finished request                          |
| `server/hydration-stream.ts`           | Re-annotates the app each flush and cuts out the blocks that changed            |
| `server/defer-blocks.ts`               | Renders `hydrate` blocks on the server between change detection passes          |
| `server/stream-runtime.ts`             | The inline script in the shell that applies chunks                              |
| `client/stream-hydration.ts`           | Keeps Angular's hydration data, block registry and HTTP in step with the stream |
| `client/stream-protocol.ts`            | The wire format shared by all of the above                                      |

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
- **Not cacheable.** Streamed responses are sent with `Cache-Control: no-store`.
- **If the response breaks off**, the browser keeps what it has and the client
  fetches the rest itself.

## Known limitations

These come from the ngp SSR path, which deliberately does not use
`@angular/ssr`:

- **No HTTP status codes.** The Worker answers every page with `200`, so the
  not-found page is served with `200` too. Per-route render modes and `AngularNodeAppEngine` are not
  available either.
- **No prerendering, service worker, critical CSS inlining, or SRI.**
- **Inline component `styles` are plain CSS.** There is no
  `inlineStyleLanguage`; every component here uses `styleUrl`, which does go
  through Vite's Sass pipeline.
- **ngp is a prototype.** Any Angular commit can break it, hence the exact pin.

## Analytics

The Cloudflare Web Analytics beacon in `apps/movies/index.html` is commented out: the token
it carried belongs to a different property. Create a Web Analytics site for this
app, swap in its token, and uncomment.
