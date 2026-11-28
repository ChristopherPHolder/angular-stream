## Streaming

- **It leans on Angular internals**: the layout of serialized hydration data,
  `ɵannotateForHydration`, the dehydrated block registry, and
  `DeferBlockFixture`'s way of rendering a block. This is why the supported
  Angular versions are the ones CI checks, listed under
  [Compatibility](../getting-started/installation.md#compatibility).
- **`hydrate when` is rendered by hand on the server.** Angular renders it during
  a template update, which throws `NG0600` from the second request on if the
  component has signal queries. The buffered fallback cannot work around that, so
  it renders without incremental hydration and leaves `@defer` blocks to the
  client.
- **`hydrate on viewport`** blocks only take streamed markup that arrives before
  Angular starts, or after the trigger has fired; its observer cannot follow
  replaced elements.
- **Event replay covers the shell's event types only.** `withEventReplay()` and
  `hydrate on hover | interaction` rely on Angular's event dispatch contract,
  which the handler adds when given `eventDispatchContract`. Angular sets it up
  for the event types the shell listens to; an event type that first appears in
  a streamed `@defer` block isn't recorded, so that block loses the clicks made
  before Angular starts. When the shell has no listeners at all, Angular removes
  the contract, and nothing is recorded.
- **No CSP nonce** on the inline scripts yet, so a strict Content Security
  Policy blocks the stream; see
  [Content Security Policy](../guides/production.md#content-security-policy).
- **Not cacheable.** Streamed responses are sent with `Cache-Control: no-store`.
- **If the response breaks off**, the browser keeps what it has and the client
  fetches the rest itself.

## Without `@angular/ssr`

Every setup but [Angular CLI](../getting-started/angular-cli.md) compiles
Angular with ngp and renders without `@angular/ssr`, which brings its own
limits:

- **No HTTP status codes.** The server answers every page with `200`, so a
  not-found page is served with `200` too. A server that knows its routes can
  set the status from outside, as
  [the demo's Worker](../../../../cloudflare-demo/src/worker.ts) does: it
  answers `404` for an address that is no page, with the body the handler
  streamed. Per-route render modes and `AngularAppEngine` are not available
  either.
- **No critical CSS inlining or SRI, and no `@angular/service-worker`
  build step.** The [Service Worker guide](../guides/service-worker.md) has an
  experimental worker of its own, which renders the pages.
- **The app doesn't get the request.** `createStreamingHandler()` and the
  adapters built on it don't provide `REQUEST`, so the app can't read the
  incoming request's cookies or headers. Rendering with
  `renderStreamingAngular()` and passing it in `platformProviders` works; see
  [Request context](../guides/production.md#request-context).
- **Inline component `styles` are plain CSS.** There is no
  `inlineStyleLanguage`; `styleUrl` files do go through Vite's Sass pipeline.
- **ngp is a prototype.** Any Angular commit can break it, hence the exact
  Angular pin.

The Angular CLI setup has none of these: `@angular/ssr` serves the app, and
only its `RenderMode.Server` routes are rendered differently.

## With `@angular/ssr`

- **Status and headers are settled when the shell goes out.** Changes the app
  makes to `RESPONSE_INIT` after that, once data has arrived, can't reach the
  response any more. Set a status from the route, or from a component that
  exists before the data does.
- **Streamed routes are not cached.** They carry `Cache-Control: no-store`,
  whatever the route's `headers` say.
- **It reaches into `@angular/ssr`'s internals** to swap the renderer, so the
  supported `@angular/ssr` versions are as narrow as the Angular ones.
