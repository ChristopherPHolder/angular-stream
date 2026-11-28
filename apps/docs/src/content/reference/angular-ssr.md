```bash
npm install @push-based/angular-ssr-stream-angular-ssr@next
```

The adapter for apps built by the Angular CLI and served by `@angular/ssr`. It
depends on [`@push-based/angular-ssr-stream-core`](core.md), whose browser
providers the app still needs. For the whole setup, see
[Angular CLI](../getting-started/angular-cli.md).

Two entry points, because they end up in two different server bundles:
`@push-based/angular-ssr-stream-angular-ssr` in `server.ts`'s, and
`@push-based/angular-ssr-stream-angular-ssr/renderer` in `main.server.ts`'s.

## `withStreaming()`

```ts
function withStreaming<Engine extends AngularEngine>(engine: Engine): Engine;

/** AngularAppEngine from @angular/ssr, or AngularNodeAppEngine from @angular/ssr/node. */
interface AngularEngine {
  handle(request: never, requestContext?: unknown): Promise<Response | null>;
}
```

Makes an engine stream the routes it renders on the server, and returns it:

```ts title="src/server.ts"
const angularApp = withStreaming(new AngularNodeAppEngine());
```

Everything else stays the engine's: the host check, matching the request to a
server route, redirects, serving prerendered pages, client-rendered routes and
locales. When the matched route's render mode is `RenderMode.Server`, the page
is rendered by the core's streaming renderer, with:

- the app bootstrapped by `main.server.ts`'s default export, into
  `index.server.html` after `@angular/ssr`'s HTML transforms;
- `REQUEST`, `REQUEST_CONTEXT`, `RESPONSE_INIT` and, for a localized build,
  `LOCALE_ID` provided on the platform, as `@angular/ssr` does;
- the route's `status` and `headers`, read once the shell is ready, so changes
  the app made to `RESPONSE_INIT` until then count. `Cache-Control: no-store`
  and `X-Accel-Buffering: no` are added;
- a redirect instead of the page when the router ended up at another URL, and
  no response at all (`null`, so the next middleware runs) when no navigation
  succeeded;
- critical CSS inlined into the shell.

When the stream fails before the first byte, the error is logged and the route
is rendered by `@angular/ssr` as it would be without streaming. When the
request is aborted, the render stops.

It reaches into `@angular/ssr`'s internals (`getAngularServerAppForRequest()`
on the engine, `handleRendering()` on the server app), so like the core it
supports a checked range of Angular versions only.

## `streamingRenderer()`

```ts
function streamingRenderer(route: StreamingRouteRender): Promise<Response | null>;
```

Renders one server-rendered route as a stream. `withStreaming()` calls it; an
app only exports it from `src/main.server.ts`:

```ts title="src/main.server.ts"
export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';
```

The Angular CLI bundles `server.ts` and `main.server.ts` separately, each with
its own copy of Angular, and the app runs on `main.server.ts`'s. Rendering it
with the other copy fails with `NG0201`, because no token of one copy is
provided by the other. `withStreaming()` takes the renderer from
`main.server.ts`'s exports for that reason. When it's missing, the server logs a
warning once, and every page is rendered without streaming.
