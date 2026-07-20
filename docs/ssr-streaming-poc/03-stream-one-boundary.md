# Slice 3: Stream one application-owned boundary

## Outcome

The early shell contains one application-owned placeholder host. When Slice 2's deterministic
asynchronous work becomes ready, an Angular directive serializes that host after its ready view has
been checked. The server immediately frames the serialized host as a preview payload, and a small
browser runtime replaces the placeholder while the response is still open.

Hydration remains disabled. The streamed boundary is preview HTML only and is never an input to
Angular hydration.

## Agreed design

### Demo boundary

Keep the counter and its button outside the streamed boundary. They remain stable shell markup for
Slice 6's hydration and event-replay experiment. The boundary itself is deliberately non-interactive
so this slice tests only delayed rendering, transport, and host replacement.

Update the root component to render this concrete boundary:

```html
<section
  streamBoundary="delayed-content"
  [streamBoundaryReady]="delayedBoundaryState.ready()"
>
  @if (delayedBoundaryState.ready()) {
    <p data-testid="stream-boundary-ready">
      Delayed server content is ready.
    </p>
  } @else {
    <p data-testid="stream-boundary-placeholder">
      Waiting for delayed server content…
    </p>
  }
</section>
```

Reuse `DelayedBoundaryState.ready` and its existing two-second `PendingTasks` delay. Do not add a
second timer, asynchronous resource, or completion promise for the boundary.

### Boundary directive contract

Add an attribute directive with the selector `[streamBoundary]`. The directive owns neither the
placeholder view nor the ready view; the application owns both through normal Angular template
control flow. The directive observes and serializes its complete host.

The boundary ID is the required static value of the `streamBoundary` attribute. Read it with
`HostAttributeToken` rather than exposing a bindable ID input. Dynamic IDs such as
`[streamBoundary]="id()"` are unsupported. Accept only IDs matching:

```text
^[A-Za-z][A-Za-z0-9_-]*$
```

Bind the validated value to `data-stream-boundary` on the host using the directive's `host`
metadata. This attribute is the identity shared by the initial placeholder, serialized ready host,
payload, and browser runtime.

Expose readiness as a required signal input named `streamBoundaryReady` with the type `boolean`.
Do not apply HTML boolean-attribute coercion; callers must bind explicit application state.

On the server, the directive follows this lifecycle:

1. During initialization, validate and register its ID with the injected request sink.
2. On every `ngAfterViewChecked()`, inspect the readiness input.
3. On the first checked pass for which readiness is `true`, read the host's `outerHTML`, emit the ID
   and serialized host synchronously, and permanently mark that directive instance as emitted.
4. Ignore later view checks and readiness changes.

Use `ngAfterViewChecked()` because Angular's `afterNextRender`, `afterEveryRender`, and
`afterRenderEffect` callbacks do not run on the server. Emitting from the checked hook guarantees
the serialized host contains the ready view rather than the placeholder.

Inject the sink token optionally. The renderer provides a sink through the request's server
platform; the browser provides none. Without a sink, streaming is disabled and the directive does
no registration, serialization, or emission. This prevents the later browser application, whose
delayed state starts ready, from participating in the server transport protocol.

### Request-scoped boundary sink

Create one sink before constructing each server platform and provide it with `useValue` under the
boundary sink injection token. Never provide the concrete sink in `root`; its registration,
emission, buffer, and subscriber belong to exactly one request.

The sink has four responsibilities:

- `register(id)` records a boundary before it becomes ready and rejects invalid or duplicate IDs.
- `emit({id, html})` accepts one emission for a registered ID and rejects duplicate or unregistered
  emissions.
- `subscribe(listener)` installs the single renderer subscriber, replays buffered emissions in
  insertion order, and forwards later emissions synchronously.
- A completion assertion verifies that exactly one boundary was registered and that it emitted
  exactly once.

Before subscription, emissions are buffered. The renderer subscribes only after the complete shell
has been successfully enqueued. This makes the protocol order unconditional even if an application
boundary emits during bootstrap:

```text
shell -> boundary payload
```

Angular's `PendingTasks` removal schedules the final change-detection tick needed for the ready
signal before the application becomes stable. After `ApplicationRef.whenStable()` resolves, use
the sink's completion assertion as a safeguard rather than adding another boundary-completion
barrier. If the assertion fails, treat it as a post-commit protocol failure and do not write the
document tail.

### Preview runtime ownership

The streaming renderer owns the preview runtime. Append one classic inline script to the serialized
open-body shell immediately before enqueueing the shell. Add it only to the serialized string; do
not insert it into `PlatformState`'s live server document. This prevents the preview transport from
appearing in Slice 4's authoritative render.

The runtime installs one `MutationObserver` on the open document body. It watches for boundary
commit comments and processes the immediately preceding payload template. The runtime is allowed to
execute in this slice; Angular's browser module scripts remain absent and the browser application
does not bootstrap.

CSP, nonces, and a runtime shared with production application code remain out of scope.

### Boundary payload framing

Frame each emission as a serialized host inside an inert template followed immediately by an inert
commit comment:

```html
<template data-stream-boundary-payload="delayed-content"><section data-stream-boundary="delayed-content">…</section></template><!--stream-boundary-commit:delayed-content-->
```

The framing function emits no bytes between `</template>` and the commit comment. The restricted ID
grammar makes the ID safe to place in the payload attribute and commit marker without a general
encoding layer. The directive's `outerHTML` is inserted as the template's complete content.

The observer reacts to the commit comment, not to insertion of the template start tag. HTTP and TCP
may split a response at any byte; observing the trailing, fully parsed comment proves that the
preceding template and its content have finished parsing.

For a valid payload, the runtime requires all of the following:

- The commit marker is immediately preceded by an `HTMLTemplateElement`.
- The template's `data-stream-boundary-payload` value equals the commit ID.
- The template contains exactly one root node and that node is an element.
- The root element's `data-stream-boundary` value equals the commit ID.
- The live document contains exactly one element with that `data-stream-boundary` value.

After validation, replace the live host with the template's root element and remove both transport
artifacts. Find candidates by their `data-stream-boundary` attribute and compare attribute values
directly; do not interpolate the ID into a CSS selector.

If validation fails, leave the existing placeholder untouched, remove the invalid template and
commit marker so they are not retried, and report a clear `console.error`. Recovery,
retransmission, nested boundaries, and multiple replacements of one boundary are out of scope.

### Renderer integration and lifecycle

After preview serialization and open-body splitting, append the runtime to the retained shell string
and enqueue that shell. Only then subscribe the renderer to the boundary sink. A buffered boundary
is replayed during subscription; later boundaries are delivered immediately.

For every emission, the subscriber:

1. Frames the ID and serialized host.
2. Encodes the complete frame with the renderer's existing `TextEncoder`.
3. Enqueues it on the response stream.
4. Logs `[ssr:<requestId>] boundary <id>` only after enqueueing succeeds.

The normal Slice 3 lifecycle is:

```text
[ssr:<requestId>] bootstrap
[ssr:<requestId>] shell
[ssr:<requestId>] boundary delayed-content
[ssr:<requestId>] stable
[ssr:<requestId>] closed
[ssr:<requestId>] destroyed
```

After stability, assert the one registered boundary was emitted, write Slice 2's retained
`</body></html>` tail, close the stream, and destroy the platform as before. Do not perform an
authoritative final serialization in this slice.

Framing, encoding, or enqueue failures after the shell has committed are renderer-owned. The sink
subscriber must not throw them back into Angular change detection. Instead, reuse Slice 2's
post-commit termination path: log `failed`, error the response stream, and destroy the platform
exactly once. Cancellation stops further boundary production and retains Slice 2's
`cancelled -> destroyed` behavior.

Invalid or duplicate registration discovered during bootstrap is a pre-commit render failure: reject
the renderer promise, destroy the platform, and let the Fastify route return its plain `500 Internal
Server Error`.

### File boundaries

Keep the implementation split by responsibility:

- `src/app/streaming/stream-boundary.directive.ts` contains the directive, sink interface, payload
  type, and injection token.
- `src/server/streaming/stream-boundary-sink.ts` contains the request-scoped registration, buffering,
  subscription, and completion state.
- `src/server/streaming/stream-boundary-protocol.ts` contains pure framing logic and the serialized
  browser runtime.
- `src/server/streaming/streaming-angular-renderer.ts` retains platform, response-stream, lifecycle,
  and cleanup orchestration.

Do not introduce a general boundary scheduler, renderer adapter, transport abstraction, or
multi-boundary policy in this slice.

## TODO

- [ ] Add the sink contract, payload type, injection token, and `[streamBoundary]` directive.
- [ ] Require a static, grammar-validated boundary ID and bind it to `data-stream-boundary`.
- [ ] Add the strict required `streamBoundaryReady` signal input.
- [ ] Register the server boundary during directive initialization.
- [ ] Serialize and emit the complete host exactly once from the first ready
      `ngAfterViewChecked()` pass.
- [ ] Make the optional sink a no-op boundary between server streaming and later browser execution.
- [ ] Render the concrete `delayed-content` placeholder and ready states from
      `DelayedBoundaryState.ready`.
- [ ] Keep the counter and button outside the streamed boundary.
- [ ] Implement the request-scoped, single-subscriber sink with ordered pre-subscription buffering.
- [ ] Reject invalid IDs, duplicate registrations, unregistered emissions, and duplicate emissions.
- [ ] Assert exactly one registered-and-emitted boundary at normal completion.
- [ ] Provide one sink instance on each request's server platform.
- [ ] Append the preview runtime only to the serialized shell, leaving the live server document
      unchanged.
- [ ] Implement the inert template plus adjacent commit-comment framing.
- [ ] Install the shell runtime that observes complete payloads and validates their full identity and
      shape before replacing a host.
- [ ] Remove consumed or invalid transport artifacts and report invalid payloads in the browser.
- [ ] Subscribe only after the shell enqueue succeeds, then connect sink emissions to response
      chunks immediately.
- [ ] Log each boundary only after its response chunk is enqueued successfully.
- [ ] Route post-commit boundary transport and completion failures through the renderer's existing
      error-and-destroy path.
- [ ] Preserve Slice 2's cancellation, tail, close, and destroy-once behavior.

## Manual checkpoint

Build the development server bundle:

```bash
npm run build:dev
```

Start the built Fastify server in a second terminal:

```bash
npm start
```

Inspect the unbuffered response:

```bash
curl --no-buffer --include http://localhost:4000/
```

Confirm in the response and server log:

- The `200`, headers, shell, `data-testid="stream-boundary-placeholder"`, and boundary runtime arrive
  before the delayed work finishes.
- The shell contains one host with `data-stream-boundary="delayed-content"`.
- After approximately two seconds, the response contains one adjacent template and
  `<!--stream-boundary-commit:delayed-content-->` frame whose host contains
  `data-testid="stream-boundary-ready"`.
- The boundary frame precedes the single terminal `</body></html>` tail.
- No application module script is present or executed; the inline preview runtime is the only new
  executable transport code introduced by this slice.
- The server log reaches `bootstrap`, `shell`, `boundary delayed-content`, `stable`, `closed`, and
  `destroyed` in that order for one request ID.

Then load `http://localhost:4000/` in a browser and confirm:

- The placeholder is visible first and changes to the ready content after approximately two
  seconds without navigation or a page reload.
- The replacement occupies the placeholder's original position and the document still contains
  exactly one `data-stream-boundary="delayed-content"` host.
- The consumed payload template and commit comment are absent from the live DOM.
- The request completes only after Angular reports stability.
- Angular has not bootstrapped or hydrated, the counter button remains non-interactive, and the
  console contains no payload-validation error.

Finally, abort a separate request during the delay and confirm it logs `cancelled` followed by
`destroyed` exactly once, with no later boundary, stable, or closed log for that request.
