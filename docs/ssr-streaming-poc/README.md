# SSR streaming POC

## Goal

Build one minimal end-to-end Angular SSR streaming path:

1. Flush the initial Angular-rendered shell before the application is stable.
2. Stream one application-owned asynchronous boundary into its placeholder.
3. Produce Angular's final hydration-annotated document.
4. Replace the preview DOM with that authoritative document.
5. Start the browser application and hydrate successfully.
6. Preserve Angular event replay and normal interaction.

The POC may replace the existing SSR implementation and application surface. Compatibility with
`AngularNodeAppEngine`, existing routes, status codes, redirects, prerendering, and critical CSS is
out of scope.

No automated tests are required. Every slice contains a manual checkpoint that must work before
starting the next slice.

## Slices

1. [Own the buffered Angular render](./01-own-buffered-render.md)
2. [Flush the initial Angular shell](./02-flush-initial-shell.md)
3. [Stream one application-owned boundary](./03-stream-one-boundary.md)
4. [Send the authoritative final document](./04-send-final-document.md)
5. [Reconcile the preview DOM](./05-reconcile-final-document.md)
6. [Hydrate and replay events](./06-hydrate-and-replay.md)

## Fixed POC decisions

- The custom renderer replaces `AngularNodeAppEngine`; no fallback path is maintained.
- Fastify sends the renderer's Web `Response` directly; Angular's Node handler and response writer
  adapters are not used.
- The POC is exercised through a development build followed by starting the built Fastify server;
  Angular CLI's SSR dev-server handler bridge is out of scope.
- The demo uses one deterministic delayed boundary, not real application data and not `@defer`.
- Boundary readiness is explicit application state.
- A boundary replaces its entire placeholder host.
- Streamed boundary HTML is preview-only and is never used as the hydration source.
- The final result from Angular's private `ɵrenderInternal()` is the authoritative hydration source.
- Browser module scripts do not execute until the authoritative DOM has been installed.
- The initial response is a known `200 text/html` response.
- Nested boundaries, CSP, timeouts, production hardening, and general routing behavior are out of scope.

## Completion condition

The POC is complete when a manual browser run shows all of the following:

- The shell is visible before the delayed work finishes.
- The boundary replaces its placeholder while the response remains open.
- The final authoritative DOM is installed.
- Angular reports successful hydration without mismatch errors.
- An interactive control works after hydration.
- An interaction performed before hydration is replayed after hydration.
