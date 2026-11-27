## Streaming

- **It leans on Angular internals**: the layout of serialized hydration data,
  `ɵannotateForHydration`, the dehydrated block registry, and
  `DeferBlockFixture`'s way of rendering a block. This is why the supported
  Angular range is narrow.
- **`hydrate when` is rendered by hand on the server.** Angular renders it during
  a template update, which throws `NG0600` from the second request on if the
  component has signal queries. The buffered fallback cannot work around that, so
  it renders without incremental hydration and leaves `@defer` blocks to the
  client.
- **`hydrate on viewport`** blocks only take streamed markup that arrives before
  Angular starts, or after the trigger has fired; its observer cannot follow
  replaced elements.
- **`hydrate on hover | interaction`** need Angular's event-dispatch contract
  script, which is not inlined.
- **No CSP nonce** on the inline scripts yet.
- **Not cacheable.** Streamed responses are sent with `Cache-Control: no-store`.
- **If the response breaks off**, the browser keeps what it has and the client
  fetches the rest itself.

## Without `@angular/ssr`

The Cloudflare setup compiles Angular with ngp and renders without
`@angular/ssr`, which brings its own limits:

- **No HTTP status codes.** The Worker answers every page with `200`, so a
  not-found page is served with `200` too. Per-route render modes and
  `AngularAppEngine` are not available either.
- **No service worker, critical CSS inlining or SRI.**
- **Inline component `styles` are plain CSS.** There is no
  `inlineStyleLanguage`; `styleUrl` files do go through Vite's Sass pipeline.
- **ngp is a prototype.** Any Angular commit can break it, hence the exact
  Angular pin.

An adapter for `@angular/build` and `@angular/ssr` is planned.
