# Slice 2: Flush the initial Angular shell

## Outcome

The repository-owned renderer returns a streaming response and flushes the Angular DOM immediately
after bootstrap, before `ApplicationRef.whenStable()` resolves.

There is no streamed boundary and no hydration in this slice. The response may temporarily end as a
non-interactive shell. The single question being answered is whether Angular's post-bootstrap,
pre-stability DOM can be serialized and delivered early.

## TODO

- [ ] Change the renderer from a buffered string response to a streaming response.
- [ ] Obtain `PlatformState` from the request platform.
- [ ] Serialize the current document with `PlatformState.renderToString()` immediately after
      bootstrap returns.
- [ ] Split the document so later protocol chunks can be written before the response is closed.
- [ ] Withhold browser module scripts from the early shell so Angular cannot bootstrap against
      preview DOM.
- [ ] Keep the Angular event-dispatch bootstrap script available for the later event-replay slice.
- [ ] Flush the shell and headers without waiting for application stability.
- [ ] Keep the platform and response alive until pending application work finishes.
- [ ] Close the response and destroy the platform cleanly after stability for this temporary slice.

## Manual checkpoint

Use the browser network panel or `curl --no-buffer` and confirm:

- Response headers and visible shell arrive immediately.
- The delayed application work is still pending when the shell arrives.
- Browser module scripts have not executed.
- The response remains open until the delayed work finishes.
