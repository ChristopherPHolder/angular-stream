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

Streamed SSR for Angular 22 on Cloudflare Workers, as a Vite+ monorepo. Read
`README.md` for how the pieces fit together; the short version:

- **Layout**: `apps/movies` (the TMDB movie browser), `apps/demo` (streamed
  hydration shown step by step, with an in-process fake API) and
  `packages/streaming` (`@angular-stream/streaming`, the renderer, inline
  runtime and client both apps use). npm workspaces.
- **Toolchain**: Vite+ (`vp`), with Angular compiled by
  `@push-based/vite-plugin-ngp`. There is no `angular.json` and no Angular CLI;
  `ng` commands do not apply here. At the root: `npm run dev` / `dev:demo` /
  `build` / `ready`. In an app: `vp -C apps/<app> dev|build|preview`. Run
  `vp check` before committing; it formats with Oxfmt (not Prettier) and lints
  with Oxlint. Import from `vite-plus`, not `vite`.
- **Shared code**: `@angular-stream/streaming` ships TypeScript source that ngp
  compiles with each app. Code there must not import from an app; take what it
  needs as options, the way `createStreamingWorker()` takes the root component
  and config.
- **SSR**: streamed by `packages/streaming/src/server/`; the browser hydrates
  the shell while the response is still open. `createStreamingWorker()` falls
  back to a buffered `renderApplication` if streaming fails before its first
  byte. `@angular/ssr` is **not** used, so `AngularAppEngine`, `serverRoutes`,
  per-route render modes and SSR status codes are unavailable.
- **Streaming**: content that depends on HTTP data belongs in a `@defer` block
  with a `hydrate` trigger, placed directly inside an element; prefer
  `hydrate when <its data is there>`. Read "Streamed hydration" in `README.md`
  and `docs/streamed-hydration.md` before changing `packages/streaming/`, and
  verify such changes the way the latter's "Verifying a change" section
  describes, in both apps. `docs/out-of-order-streaming/` is the
  pre-implementation research, not a description of the current code.
- **Demo**: every box in `apps/demo` states what is happening at that step. If a
  change to `packages/streaming` changes what happens, update the demo's text
  and `docs/streamed-hydration.md` with it.
- **Server entry**: each app's `src/worker.ts`, a Workers `fetch` handler. It
  runs in workerd: no `node:fs`, no `window`, no Node globals. Check any new
  server-side dependency against that before reaching for it.
- **Angular version is pinned to exactly `22.3.0-rc.0`** in every workspace.
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
