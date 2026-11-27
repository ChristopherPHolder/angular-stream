## The wire format

Defined in [`stream-protocol.ts`](../../../../../packages/core/src/client/stream-protocol.ts).
Field names are short because every chunk repeats them.

A chunk is the stylesheets of any components new to the page, then one
`<template data-ngs="id">` per block, then one script:

```html
<style ng-app-id="ng">
  …
</style>
<template data-ngs="d1">…the block's new root nodes…</template>
<script>
  __ngs.push({ "b": [...], "s": {...}, "p": [...], "done": true })
</script>
```

Angular adds a component's stylesheet to `<head>` the first time the component
renders: a `<style>` in a production build, a `<link>` in dev. A component that
first renders inside a streamed block does so after the shell has gone out, so
the chunk carries its stylesheet, ahead of the markup that needs it. Without
that, the block would stay unstyled until the browser rendered the component
itself at hydration.

The script comes last so every template ahead of it has been fully parsed when
it runs.

| Field     | Meaning                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b`       | Blocks to replace, in the order their templates appear                                                                                                               |
| `b[].id`  | The block's id as the client knows it, which is its `<!--ngh=id-->` anchor                                                                                           |
| `b[].o`   | How many root nodes the server thinks are in front of the anchor. Only used before Angular attaches; after that the app counts.                                      |
| `b[].v`   | The block's serialized view, replacing what the client holds                                                                                                         |
| `b[].n`   | Hydration views for components inside the block. The markup's `ngh` attributes index into this list, and the runtime rebases them onto the end of the client's list. |
| `b[].d`   | Defer info for this block and every block nested in it                                                                                                               |
| `s`       | Transfer state entries added since the previous flush (TMDB responses)                                                                                               |
| `p`       | Requests still in flight on the server, as `METHOD url`                                                                                                              |
| `done`    | The server render is complete; nothing follows                                                                                                                       |
| `aborted` | Never sent. The runtime adds it when the document ends without a `done` chunk.                                                                                       |

The shell carries `StreamInit` (`n`, `p`) inline in the runtime script.

## What the server does on each flush

[`streaming-angular-renderer.ts`](../../../../../packages/core/src/server/streaming-angular-renderer.ts)
loops: wait for the next tracked request to finish, wait for the app to
settle (stable, a task, stable again, so near-simultaneous responses share a
flush), render any new `@defer` blocks, then flush.

[`hydration-stream.ts`](../../../../../packages/core/src/server/hydration-stream.ts) builds
the flush. Angular's hydration annotation only works on a whole app, so every
flush:

1. Runs `ɵannotateForHydration` over the whole app again.
2. Finds each block and compares a signature of its own content (markup and
   view, with nested blocks cut out) against what the client was last sent.
3. Cuts out only the blocks that changed, and rewrites the two things a fresh
   pass renumbers:
   - **`ngh` indices**, which become positions in the block's own `n` list;
   - **block ids**, since a pass numbers blocks from `d0` in the order it
     meets them. Each block keeps the id the client first saw it under.
4. Adds only the transfer state keys the client does not have yet.

A flush is skipped when nothing changed: no block, no new state, the same
pending list, and not done.

## What the browser does with a chunk

**The inline runtime**
([`stream-runtime.ts`](../../../../../packages/core/src/server/stream-runtime.ts)) is a
classic script, so it exists before Angular does, and each chunk's script
calls it while the parser is still running. For each block it:

- takes the template, and finds the anchor comment;
- rebases the `ngh` indices in the new markup onto the end of the client's
  hydration list;
- resolves Angular's text markers (`ngetn`, `ngtns`) itself, since Angular
  only resolves them once at bootstrap;
- removes the old root nodes in front of the anchor and inserts the new ones.

Before Angular attaches, chunks are queued in `__ngs.log`. After that they go
straight to the app.

**`StreamHydrationClient`**
([`stream-hydration.ts`](../../../../../packages/core/src/client/stream-hydration.ts)) keeps
Angular in step:

- **Hydration data.** It rewrites the view Angular holds for a replaced block
  in place, so hydrating it later walks the new markup.
- **Declining a swap.** It reports `null` root nodes for a block Angular has
  already hydrated, and the runtime then drops that block's template.
- **HTTP.** `streamHttpInterceptor` holds back any request listed in `p` until
  a chunk no longer lists it. By then its response is in transfer state, and
  Angular's transfer cache answers it without a fetch.
- **Triggers that ignore data.** Blocks whose hydrate trigger is `idle`,
  `immediate`, `timer` or `viewport` are kept out of Angular's dehydrated block
  registry until the stream is done. Such a trigger can fire while the block's
  content is still on its way. Kept out, the block waits the way a nested block
  waits for its parent, and resumes when it is released. `hydrate when` blocks
  are never held: their condition only turns true from data that arrived in
  the same chunk as their markup.

## When something goes wrong

- **Before the first flush:** the Worker catches the error, logs
  `[ssr] streaming render failed before commit, falling back`, and renders the
  page with a buffered `renderApplication` instead (`createStreamingHandler()`
  in [`handler.ts`](../../../../../packages/core/src/server/handler.ts)). That render has
  incremental hydration switched off, so `@defer` blocks are left for the
  client. A page with no `window.__ngs` came from this path.
- **After the first flush:** the status is already sent. The server logs
  `[ssr] streaming render failed after commit` and breaks the stream. The
  browser keeps what it has. When the document ends without a `done` chunk, the
  runtime pushes `{done: true, aborted: true}`, the client releases everything
  it was holding, and the app fetches what is missing itself.
- **The client goes away:** cancelling the body tears down the server
  platform.

Streamed responses are sent with `Cache-Control: no-store`: a cached copy of a
partial response would be worse than none.
