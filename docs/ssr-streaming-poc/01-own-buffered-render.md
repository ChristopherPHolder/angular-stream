# Slice 1: Own the buffered Angular render

## Outcome

The server no longer uses `AngularNodeAppEngine` or Angular's Node request/response adapters.
Repository-owned code creates the Angular server platform, bootstraps the application, waits for
stability, produces Angular's hydration-annotated HTML, and returns it as a normal buffered Web
`Response`. Fastify sends that response using its native Web API support.

This deliberately does not stream yet. It proves that the POC owns the complete platform lifecycle
and can still produce a hydratable document before response timing is changed. It targets Angular
21.1.x and may use Angular private APIs directly.

## Agreed design

### Application surface

Replace the bootstrapped application surface with a minimal standalone POC root containing:

- An obvious server-rendered marker
- A counter value
- A counter button

Replace the active application configuration with only the providers required for zone-based change
detection, server rendering, hydration, incremental hydration, and event replay. Existing feature
code can remain on disk, but routing, TMDB, SVG, state, app initializers, and custom renderer/style
providers must be disconnected from bootstrap.

### Fastify boundary

Keep SSR as a focused Fastify plugin. At plugin startup, load and cache the built
`index.server.html` located beside the built server entry. Failure to load the document should fail
server/plugin startup rather than the first request.

The wildcard route constructs an absolute request URL and calls a Fastify-independent renderer:

```ts
renderBufferedAngular({
  document,
  url,
  requestId,
}): Promise<Response>
```

Use Fastify's request ID for lifecycle logging. Send the returned response with Fastify's native
`reply.send(response)` support.

Do not use or reproduce:

- `AngularNodeAppEngine`
- `createNodeRequestHandler()`
- `writeResponseToNodeResponse()`
- Raw Node request re-emission through `fastify.server`
- An exported Angular CLI `reqHandler`

The supported development workflow is the repository's development build followed by starting the
built Fastify server. `nx serve` SSR integration is not a requirement.

### Angular renderer

Implement one module at `src/server/streaming/buffered-angular-renderer.ts`. Do not introduce
platform factories, lifecycle classes, response builders, or framework adapters in this slice.

For each request, the renderer:

1. Creates a server platform with `platformServer()`.
2. Provides `INITIAL_CONFIG` with the cached document and absolute request URL.
3. Provides the private `ɵSERVER_CONTEXT` token with the value `"ssr"`.
4. Invokes the existing server bootstrap function with the new platform.
5. Waits for `ApplicationRef.whenStable()`.
6. Calls the private `ɵrenderInternal()` directly.
7. Creates a buffered Web `Response` containing the serialized document.
8. Schedules `PlatformRef.destroy()` in a macrotask from `finally` and waits for that cleanup.

Do not separately destroy `ApplicationRef`; destroying the platform owns application cleanup. Do not
provide `REQUEST`, `REQUEST_CONTEXT`, or `RESPONSE_INIT`, because the minimal POC does not consume
them.

The response is always:

```text
200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
```

The renderer throws bootstrap or serialization failures. The Fastify route logs the original error
and sends a plain `500 Internal Server Error` response.

### Lifecycle logging

Keep concise request-scoped lifecycle logs for the duration of the POC:

```text
[ssr:<requestId>] bootstrap
[ssr:<requestId>] stable
[ssr:<requestId>] serialized
[ssr:<requestId>] destroyed
```

Remove or disconnect the existing per-renderer and per-style tracing.

## TODO

- [x] Replace the active application root with the server-rendered marker and signal-based counter.
- [x] Replace the active browser and server configuration with the agreed minimal providers.
- [x] Disconnect routing, application initializers, feature services, SVG providers, and custom
      renderer/style providers from bootstrap.
- [x] Add `src/server/streaming/buffered-angular-renderer.ts` with the agreed renderer contract.
- [x] Create a request platform with `INITIAL_CONFIG` and `ɵSERVER_CONTEXT: "ssr"`.
- [x] Bootstrap through the existing server bootstrap function.
- [x] Wait for `ApplicationRef.whenStable()`.
- [x] Call `ɵrenderInternal()` directly and create the buffered Web `Response`.
- [x] Set the agreed success status and response headers.
- [x] Add request-scoped bootstrap, stability, serialization, and destruction logs.
- [x] Destroy the platform once, in the agreed macrotask cleanup path, on success and failure.
- [x] Load and cache the built `index.server.html` when the Fastify SSR plugin starts.
- [x] Replace the engine call with the custom renderer and native `reply.send(response)`.
- [x] Remove Angular's Node handler/writer imports and delete the exported `reqHandler` bridge.
- [x] Keep Fastify static asset handling and non-SSR utility routes unchanged.
- [x] Log render failures and return a plain Fastify `500` response.

## Manual checkpoint

Run the development build, start the built Fastify server, open the POC in a browser, and confirm:

- Page source contains the rendered POC marker, counter, and Angular hydration annotations.
- The development console reports hydrated components and nodes.
- No `NG05xx` hydration mismatch or client-render fallback is reported.
- The counter button updates after hydration.
- Fastify returns `200`, `text/html; charset=utf-8`, and `Cache-Control: no-store`.
- The request log reaches `bootstrap`, `stable`, `serialized`, and `destroyed` in that order using
  one request ID.
- A render failure is logged and produces a plain `500 Internal Server Error`.

Do not proceed until buffered hydration works under the repository-owned renderer.
