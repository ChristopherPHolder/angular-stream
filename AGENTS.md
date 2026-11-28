You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

## This project

Streamed SSR for Angular 22, as an Nx workspace over pnpm, published as
`@push-based/angular-ssr-stream-*` packages. Read `README.md` for how the pieces fit
together; the short version:

- **Layout**: `apps/movies` (the TMDB movie browser) and
  `apps/cloudflare-demo` (streamed hydration shown step by step, with an
  in-process fake API) are private apps, each deployed as a Cloudflare Worker.
  `packages/core` (`@push-based/angular-ssr-stream-core`: the renderer, inline
  runtime and client, runtime-agnostic) and the adapters are published to npm:
  `packages/cloudflare` (`createStreamingWorker()`), `packages/node`
  (`node:http`, Connect, Express, and a Vite dev plugin), `packages/fastify`,
  `packages/nestjs` (on Express or Fastify), `packages/aws-lambda`,
  `packages/nitro` and `packages/angular-ssr` (`withStreaming()` for
  `@angular/ssr`'s engine, for Angular CLI apps), each
  `@push-based/angular-ssr-stream-<name>`. Runtimes that
  speak `Request`/`Response` natively (Hono, Deno, Bun, Fastly, Vercel,
  Netlify, Azure Functions, a Service Worker) have a docs recipe and an
  example, but no package. `apps/docs` is the documentation site (prerendered,
  GitHub Pages), `libs/design-system` (`@angular-ssr-stream/design-system`,
  private) the design system the demo and the docs share, and `press-kit`
  (`@angular-ssr-stream/press-kit`, private) the logo.
- **Runtime examples**: each adapter has one `apps/example-<runtime>` (private,
  not deployed) that renders the same page, `libs/stream-example`
  (`@angular-ssr-stream/stream-example`): a shell sent at once and one widget whose
  in-process fake API answers 2 s later. An example holds only `index.html`,
  `src/main.ts`, `src/app/app.config*.ts` and its server entry;
  `apps/example-cloudflare` is the reference to copy. It streams when the
  shell arrives at once and the widget's `<template data-ngs>` chunk about 2 s
  later (`curl -N`); anything else means something buffered.
- **Toolchain**: Nx runs the tasks (`pnpm nx <target> <project>`,
  `run-many`, `affected`); targets are inferred from each `package.json`'s
  scripts, which call Vite+ (`vp`). Angular is compiled by
  `@push-based/vite-plugin-ngp`, except in `apps/example-angular-cli`, an
  app made by `ng new --ssr` and built by `ng build` (its `package.json`
  scripts call `ng`). Nowhere else is there an `angular.json`; `@nx/angular`
  does not apply here. At the root: `pnpm dev` /
  `dev:demo` / `build` / `ready`. Run `vp check` before committing; it formats
  with Oxfmt (not Prettier), lints with Oxlint and enforces module boundaries.
  Import from `vite-plus`, not `vite`. Use pnpm, never npm.
- **Packages**: in this repo the apps import the packages' TypeScript source,
  and ngp compiles it with each app; `vp pack` builds `dist/` only for
  publishing. Packages must not import from an app, the core must not import
  an adapter or any runtime-specific API (only web `Request`, `Response` and
  streams), and an adapter imports only the core, or another adapter it is
  built on (Fastify and NestJS on Node, NestJS on Fastify). The Nx tags in each
  `package.json` enforce this. Take what a package needs as options, the way
  `createStreamingHandler()` takes the root component, config and
  `loadTemplate`. Packages carry no Angular decorators (they are not compiled
  by Angular when published): provide services through an `InjectionToken`
  with a factory, as `STREAM_HYDRATION_CLIENT` does.
- **New runtime adapter**: a new `packages/<runtime>` named
  `@push-based/angular-ssr-stream-<runtime>`, tagged `type:package` and
  `runtime:<runtime>`, depending on the core with `workspace:*`, wrapping
  `createStreamingHandler()`. Add its tag to the boundary rules in
  `vite.config.ts`. Everything under `packages/` is released together. Make a
  package only when a runtime doesn't speak `Request`/`Response` or needs
  shared plumbing; otherwise a docs recipe and an `apps/example-<runtime>` are
  enough. Every adapter's example answers a missing `/assets/*` with `404` and
  renders `/index.html` as a page; keep new ones the same.
- **Releases**: `nx release`, one fixed group, versions from conventional
  commits, run by `.github/workflows/release.yml`. Commit messages are
  therefore conventional (`feat(core): …`, `fix(cloudflare): …`).
- **SSR**: streamed by `packages/core/src/server/`; the browser hydrates the
  shell while the response is still open. `createStreamingHandler()` falls back
  to a buffered `renderApplication` if streaming fails before its first byte.
  Outside `apps/example-angular-cli`, `@angular/ssr` is **not** used, so
  `AngularAppEngine`, `serverRoutes`, per-route render modes and SSR status
  codes are unavailable there. With the Angular CLI, `withStreaming()`
  (`packages/angular-ssr`) leaves `@angular/ssr` in charge and only streams its
  `RenderMode.Server` routes; the renderer it calls has to be exported from
  the app's `main.server.ts`, whose bundle has its own copy of Angular.
- **Streaming**: content that depends on HTTP data belongs in a `@defer` block
  with a `hydrate` trigger, placed directly inside an element; prefer
  `hydrate when <its data is there>`. Read the docs' "How it works" and
  "Making something stream" pages (`apps/docs/src/content/`) before changing
  `packages/core/`, and verify such changes the way "Debugging and verifying"
  describes, in both Worker apps. `docs/out-of-order-streaming/` is the
  pre-implementation research, not a description of the current code.
- **Demo**: four pages, from the idea to the detail. `/`
  (`apps/cloudflare-demo/src/app/home/`) is the landing page: why, shown as the same page
  sent three ways, then how, as one response stepped through, then where the
  idea comes from. Both visuals are drawings with fixed times and made-up
  content. `/example` is the real thing with one widget, and the least code
  that streams it. `/walkthrough` and `/inspect` hold everything more involved.
  Keep the first two simple. Every box in `apps/cloudflare-demo` states what is happening
  at that step. If a change to `packages/` changes what happens, its
  API or its wire format, update the demo's text, the hand-written code in
  `example/samples.ts` and `home/response-player.ts`, and the docs with it.
  Quotes on the landing page and in the docs' "Why stream out of order" are
  verbatim from the linked sources; do not reword them.
- **Docs vs demo**: the demo shows (interactive pages, live streams); the docs
  explain (written pages: getting started, guides, how it works, API). Written
  explanation goes in `apps/docs/src/content/`, not in the demo or the README.
  A docs page is a Markdown file plus an entry in `src/app/docs/nav.ts`; a
  runtime's setup page is listed under "Runtimes" there, with its `runtime`
  facts (its adapter, if any, and its example app). Read
  `apps/docs/README.md` for the Markdown extras and how links work. The docs
  are static: `vp build` plus `scripts/prerender.ts`, no Worker, so nothing
  there may depend on a request.
  The docs' home page is the exception to "the docs explain": its first screen
  is the hook, a headline, the two ways on (get started, the live demo) and one
  drawing, `src/app/home-race.ts`, which is the demo's race in two lanes with
  the same made-up times. Keep the two in step, and the buttons on the first
  screen.
- **Styles (demo and docs)**: both use the PushBased design system in
  `libs/design-system/` (read its `README.md`). Use its tokens and the
  `.pb-*` component classes and `.text-*` type styles; never hard-code colours,
  spacing or radii. `apps/cloudflare-demo/src/styles.css` maps the demo's meaning colours
  (`--server`, `--placeholder`, `--chunk`, `--hydrated`) onto its state scales.
- **Logo**: `press-kit/` is the one copy of the logo, and its `README.md` says
  which file is for what. The demo and the docs import the symbol from it
  (`@angular-ssr-stream/press-kit/...`), and the docs publish the folder under
  `press-kit/` and show it on the "Press kit" page. Each app's `public/`
  holds copies of `press-kit/favicon/`'s `favicon.ico`, `favicon.svg` and
  `apple-touch-icon.png`. Do not redraw, recolour or inline the logo; add a
  file to the kit instead.
- **Server entry**: each Worker app's `src/worker.ts`, a Workers `fetch` handler. It
  runs in workerd: no `node:fs`, no `window`, no Node globals. Check any new
  server-side dependency against that before reaching for it.
- **Angular version is pinned to exactly `22.3.0-rc.0`** in every project.
  Do not bump any `@angular/*` package on its own; ngp imports private
  `@angular/compiler-cli` APIs and only works against that exact release.
- **Styles**: component `styleUrl` files go through Vite's Sass pipeline. Inline
  `styles` are plain CSS only, no Sass there.
- **Icons (movies)**: `<fast-svg name="...">`. Adding an icon means dropping the
  file in `apps/movies/public/assets/svg-icons/` _and_ registering it in
  `apps/movies/src/app/renderer/svg-icons.ts`, or it will not render during SSR.

### Source code reference

Source for dependencies may be fetched into `opensrc/` (gitignored) for reading
implementation details rather than types alone:

```bash
npx opensrc <package>           # npm package
npx opensrc <owner>/<repo>      # GitHub repo
```

Anything already in `opensrc/` predates the move to Angular 22 and Vite, so
re-fetch before trusting it.
