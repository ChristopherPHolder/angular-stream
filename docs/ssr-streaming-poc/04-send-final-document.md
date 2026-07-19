# Slice 4: Send the authoritative final document

## Outcome

After Angular becomes stable, the server produces the complete hydration-annotated document and
sends it as the final protocol payload. The browser does not install it yet.

This isolates final serialization and safe transport from DOM reconciliation.

## TODO

- [ ] Wait for `ApplicationRef.whenStable()` after all preview boundary chunks have been emitted.
- [ ] Call `ɵrenderInternal()` on the still-live platform and application.
- [ ] Treat the returned HTML as the only authoritative hydration document.
- [ ] Encode the complete document in a form that cannot terminate or corrupt the surrounding HTML
      protocol payload.
- [ ] Append an inert final-document payload after the preview chunks.
- [ ] Include an explicit marker that distinguishes the final payload from boundary payloads.
- [ ] Close the HTML stream only after the complete final payload has been written.
- [ ] Destroy the application/platform after the stream closes.

## Manual checkpoint

Inspect the unbuffered response and confirm:

- The shell arrives first.
- The boundary preview arrives second.
- The final-document payload arrives last.
- Decoding the final payload produces a complete HTML document containing Angular hydration
  annotations and the resolved boundary content.
- The final payload is not yet changing the visible browser DOM.
