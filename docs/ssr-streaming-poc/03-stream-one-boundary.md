# Slice 3: Stream one application-owned boundary

## Outcome

The early shell contains one placeholder. When deterministic asynchronous application work becomes
ready, Angular-owned code emits the rendered host and the browser replaces the placeholder while the
response is still open.

Hydration remains disabled. The streamed boundary is preview HTML only.

## TODO

- [ ] Reuse Slice 2's `DelayedBoundaryState.ready`; do not introduce another delay.
- [ ] Render a stable placeholder host with a unique `data-stream-boundary` ID in the initial shell.
- [ ] Define the request-scoped boundary sink and its Angular injection token.
- [ ] Provide one sink instance on each server platform.
- [ ] Implement the boundary directive with a stable ID and explicit boolean readiness input.
- [ ] After the ready view has been checked, serialize the directive's complete host exactly once.
- [ ] Buffer an emission if it happens before the initial shell has been flushed.
- [ ] Define the HTML framing for one boundary payload using an inert template.
- [ ] Install a small runtime in the shell that finds the matching placeholder and replaces its
      entire host.
- [ ] Connect sink emissions to response chunks immediately after the shell.

## Manual checkpoint

Confirm with `curl --no-buffer` and a browser:

- The shell and placeholder arrive first.
- The boundary chunk arrives only after the configured delay.
- The placeholder is replaced in its original position without a page reload.
- The response remains open after the preview replacement until Angular becomes stable.
- No browser application module has executed yet.
