This is the setup `apps/example-angular-cli` in the repository uses: an app
made by `ng new --ssr`, built by `ng build`, and served by `@angular/ssr`'s
`AngularNodeAppEngine` behind Express. `@angular/ssr` stays in charge of every
request. The only thing that changes is how a route with `RenderMode.Server` is
rendered: as a stream, instead of all at once.

Starting from a fresh `ng new my-app --ssr`, that takes changes to four files,
and a fifth, `angular.json`, for the hosts it answers on in production.
On Angular 19.2, 20.3 or 21.2, two more apply; see
[Angular 19 to 21](#angular-19-to-21).

## 1. Install

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-angular-ssr@next
```

The core brings the browser providers, the adapter the glue to `@angular/ssr`.

## 2. The browser config

```ts title="src/app/app.config.ts"
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([streamHttpInterceptor])),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration(): it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

`streamHttpInterceptor` reports each request to the renderer on the server,
and in the browser holds back a request the server is already making until its
response arrives on the stream. `provideStreamHydration()` keeps Angular's
hydration data and block registry in step with the chunks. On the server it
also brings what the streaming renderer needs from the app's injector.

`app.config.server.ts` stays as `ng new` wrote it.

## 3. The server routes

`ng new` prerenders every route. A prerendered page is a file written at build
time, with nothing left to stream, so render the routes that should stream on
the server:

```ts title="src/app/app.routes.server.ts"
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
```

Routes left on `RenderMode.Prerender` or `RenderMode.Client` keep working as
before; only `RenderMode.Server` routes stream.

## 4. The server

Wrap the engine in `src/server.ts`, the one line that changes there:

```ts title="src/server.ts"
import { AngularNodeAppEngine } from '@angular/ssr/node';
import { withStreaming } from '@push-based/angular-ssr-stream-angular-ssr';

const angularApp = withStreaming(new AngularNodeAppEngine());
```

And export the renderer from `src/main.server.ts`:

```ts title="src/main.server.ts"
import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;

export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';
```

The Angular CLI bundles `server.ts` and `main.server.ts` separately, and each
bundle gets its own copy of Angular. The app runs on `main.server.ts`'s copy,
so that is the one the page has to be rendered with: `withStreaming()` finds
the renderer among `main.server.ts`'s exports. Without the export, the server
logs a warning once and renders every page without streaming.

## 5. Allowed hosts

`@angular/ssr` answers `400` to a `Host` header it doesn't know, before
anything renders. List your hosts in `angular.json`, under the build target's
options:

```json title="angular.json"
"security": {
  "allowedHosts": ["localhost", "my-app.example.com"]
}
```

or at runtime, in `NG_ALLOWED_HOSTS` (comma-separated).

## 6. Develop

```bash
ng serve   # http://localhost:4200
```

`ng serve` runs `server.ts` too, so pages stream in development as they do in
production.

## 7. Build and run

```bash
ng build
node dist/my-app/server/server.mjs   # http://localhost:4000, or $PORT
```

## 8. Check that it streams

Before you put anything in front of the server:

<!-- include ../_shared/check-it-streams.md url=http://localhost:4000/ -->

## 9. Behind a proxy

A proxy, a CDN or compression middleware can hold the response back until it
is complete, and the page then arrives all at once. Streamed responses carry
`X-Accel-Buffering: no` for Nginx; for the rest, read
[Streaming through proxies](../guides/streaming-through-proxies.md).

## 10. Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).

## What `@angular/ssr` still does

Everything it did before, except render `RenderMode.Server` routes in one
piece:

- **The host check**, server routes, redirects, locales, and
  `RenderMode.Prerender` and `RenderMode.Client` routes, all unchanged.
- **Status and headers.** A route's `status` and `headers` apply to the
  streamed response. So do changes the app makes to `RESPONSE_INIT`, as long as
  it makes them before the shell goes out, which is once the route and its
  `@defer` blocks are in place: a not-found component that sets the status in
  its constructor gets its `404`.
- **Redirects from the router.** When a guard or a `redirectTo` sends the
  router elsewhere, the response is a redirect, as with `@angular/ssr` alone.
- **`REQUEST`, `REQUEST_CONTEXT` and `RESPONSE_INIT`** are provided as
  `@angular/ssr` provides them.
- **Critical CSS** is inlined into the shell.
- **If streaming fails** before the first byte is sent, the route is rendered
  by `@angular/ssr` as usual, and the error is logged.

Streamed responses carry `Cache-Control: no-store`, whatever the route's
headers say: a cached copy of a partial response would be worse than none.

## Angular 19 to 21

The steps above are for Angular 22, which `ng new` gives you today. On 19.2,
20.3 or 21.2, check the patch against the
[compatibility table](installation.md#compatibility), then:

- **Turn on incremental hydration.** Angular 22 does it by default; before
  that, add `withIncrementalHydration()` from `@angular/platform-browser` to
  `provideClientHydration()`. Without it nothing streams, and the server warns.
- **Check `main.server.ts`.** Its `bootstrap` has to take the
  `BootstrapContext` it is called with and pass it to
  `bootstrapApplication()`, as in step 4. `ng new` writes it that way in every
  supported version, but an app made before Angular's security fix that added
  it may still have a `bootstrap` that takes no argument: add it.
- **On 19**, zoneless is `provideExperimentalZonelessChangeDetection()`. Zone.js
  works as well.
