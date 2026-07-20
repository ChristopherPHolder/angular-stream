# Slice 2: Flush the initial Angular shell

## Outcome

The repository-owned renderer returns a streaming response and flushes the Angular DOM immediately
after bootstrap, before `ApplicationRef.whenStable()` resolves.

There is no streamed boundary, authoritative final serialization, or hydration in this slice. The
response contains a non-interactive preview shell and closes after Angular becomes stable. The
single question being answered is whether Angular's post-bootstrap, pre-stability DOM can be
serialized and delivered early while the request platform remains alive.

## Agreed design

### Deterministic pending work

Move ownership of the POC's single deterministic delay from Slice 3 into this slice. Add
`src/app/streaming/delayed-boundary.state.ts` containing:

- An injectable `DelayedBoundaryState`
- A named `DELAYED_BOUNDARY_MS = 2_000` constant
- A readonly `ready` signal

On the server, the service uses Angular's public `PendingTasks.run()` API to keep the application
unstable for the delay and sets `ready` when the timer resolves. In the browser, `ready` starts as
resolved so the application does not repeat the server delay during the later hydration slice.

The root component injects the service so the task starts during bootstrap. Slice 2 does not render
conditionally from `ready`; Slice 3 will consume the same state to render its boundary. Change the
existing marker text to `Rendered by the streamed Angular SSR POC` while retaining
`data-testid="ssr-marker"`.

### Streaming renderer contract

Rename the renderer to `src/server/streaming/streaming-angular-renderer.ts` and expose:

```ts
renderStreamingAngular({
  document,
  url,
  requestId,
}: StreamingAngularRenderOptions): Promise<Response>
```

Keep the Fastify-independent `Promise<Response>` boundary and update the Fastify plugin import and
call site. Do not introduce stream lifecycle classes, response builders, or framework adapters.

The renderer bootstraps Angular and serializes the shell before resolving its promise. The response
body is a Web `ReadableStream<Uint8Array>` encoded with one `TextEncoder`. Enqueue the shell as the
first chunk and return the `Response` without awaiting application stability. A renderer-owned
asynchronous completion task waits for `ApplicationRef.whenStable()`, writes the retained document
tail, closes the stream, and destroys the platform.

The response remains:

```text
200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
```

Do not set `Content-Length`, `Transfer-Encoding`, or proxy-specific buffering headers. Fastify sends
the Web `Response` through its existing native `reply.send(response)` integration.

### Preview serialization and script policy

Obtain `PlatformState` from the request platform and call `PlatformState.renderToString()` as soon
as bootstrap returns. Do not call `ɵrenderInternal()` in this slice, either before or after
stability.

Before preview serialization, detach every `script[type="module"]` from the live server document,
recording each script's parent and next sibling. Restore every detached script to its original
position immediately after serialization, including when serialization fails. This keeps the live
document intact for Slice 4's authoritative render while ensuring `polyfills.js`, `main.js`, and any
other browser modules are neither sent nor executed anywhere in the Slice 2 response.

Preserve the build-injected `#ng-event-dispatch-contract` inline script in the preview shell. It may
define `window.__jsaction_bootstrap`, but this slice does not promise event capture: direct
`PlatformState` serialization does not add Angular's `jsaction` hydration annotations or the
listener-registration script produced by `ɵrenderInternal()`. Listener registration remains later
protocol work.

### Open-body stream envelope

After serialization, pass the preview document through a small pure splitter. It finds the final
`</body>` and accepts the document only when the remaining suffix is a terminal `</body>` followed
by `</html>`, allowing whitespace and preserving the exact serialized suffix. Missing or malformed
terminal tags and trailing markup are pre-commit rendering failures.

Enqueue everything before the terminal `</body>` as the shell and retain the terminal body/html
suffix as the tail. This establishes the protocol envelope used by later slices: boundary and final
document payloads can be written inside the still-open body. In Slice 2 there are no intermediate
payloads. After stability, write only the retained tail and close the stream; do not serialize the
stabilized document again.

### Failure, cancellation, and cleanup

Bootstrap, module-script handling, initial serialization, document splitting, response creation, or
first-chunk failures happen before the renderer returns its `Response`. Reject the renderer promise,
destroy the platform, and let the Fastify route send its existing plain `500 Internal Server Error`.

Once the response has been returned, its `200` status is committed. A later failure is owned by the
renderer: log it with the request ID, error the stream, and destroy the platform. It cannot be
converted into a Fastify `500`.

If the response body is cancelled, stop producing chunks and destroy the platform promptly instead
of waiting for stability. Platform destruction is the cancellation boundary; the POC does not need
a general cancellation protocol for the application task. Normal completion, failure, and
cancellation share a destroy-once guard so racing paths cannot destroy the platform twice. Preserve
Angular's macrotask platform-destruction behavior.

### Lifecycle logging

The normal request-scoped lifecycle is:

```text
[ssr:<requestId>] bootstrap
[ssr:<requestId>] shell
[ssr:<requestId>] stable
[ssr:<requestId>] closed
[ssr:<requestId>] destroyed
```

`shell` means preview serialization and first-chunk enqueue succeeded. A post-commit failure logs
`failed` before `destroyed`; cancellation logs `cancelled` before `destroyed`. Neither exceptional
path logs `closed`.

## TODO

- [ ] Add `DelayedBoundaryState`, its two-second server `PendingTasks` delay, and browser-resolved
      initial state.
- [ ] Inject the delayed state from the root component without rendering conditionally from it.
- [ ] Update the visible POC marker from buffered to streamed SSR.
- [ ] Rename the buffered renderer module, function, and options type to their streaming names.
- [ ] Update the Fastify plugin to call `renderStreamingAngular()`.
- [ ] Obtain `PlatformState` and its live document from the request platform.
- [ ] Temporarily detach and restore all module scripts around preview serialization.
- [ ] Serialize the current document with `PlatformState.renderToString()` immediately after
      bootstrap returns.
- [ ] Preserve the event-dispatch contract script without claiming replay listener registration.
- [ ] Add the strict pure helper that splits the shell from the terminal body/html tail.
- [ ] Return a streaming Web `Response` after enqueueing the encoded shell, without awaiting
      stability.
- [ ] Wait for application stability in the renderer-owned completion task.
- [ ] Write only the retained tail, close the stream, and destroy the platform after stability.
- [ ] Handle post-commit failures by logging, erroring the stream, and destroying the platform.
- [ ] Handle body cancellation by stopping production and destroying the platform promptly.
- [ ] Guard platform destruction across success, failure, cancellation, and pre-commit errors.
- [ ] Replace the buffered lifecycle trace with the agreed streaming lifecycle states.

## Manual checkpoint

Run the development build, start the built Fastify server, and use both the browser network panel
and `curl --no-buffer` to confirm:

- The `200`, content type, cache header, and visible streamed-SSR marker arrive immediately.
- The request remains open for approximately two seconds after the shell appears.
- The response source contains no module script tags, including `polyfills.js` and `main.js`.
- No browser application bootstrap or hydration occurs, including after the response closes.
- The event-dispatch contract is present and `window.__jsaction_bootstrap` is defined, without any
  claim that replay listeners are registered yet.
- The response ends with one valid `</body></html>` tail and contains no boundary or final-document
  protocol payload.
- The server log reaches `bootstrap`, `shell`, `stable`, `closed`, and `destroyed` in that order using
  one request ID.
- Aborting a separate request during the delay logs `cancelled` then `destroyed` exactly once and
  never later logs `stable` or `closed` for that request.
