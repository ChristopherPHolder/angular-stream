## Quick checks

- `window.__ngs` is the inline runtime. If it is missing, the server fell back
  to the buffered render and logged
  `[ssr] streaming render failed before commit`. See
  [When something goes wrong](../concepts/internals.md#when-something-goes-wrong).
- Check hydration in dev mode. Angular only checks node matches there.
- To see the steps one at a time, open
  [the demo](https://angular-stream-demo.chris-holder.workers.dev/), or run it
  locally with `pnpm dev:demo`. `/example` streams one widget and shows the
  code for it; `/walkthrough` and `/inspect` show each flush and each hydration
  as it happens.
- Request each page at least twice on the same server process. NG0600 from
  `hydrate when` only shows from the second request on.

## Verifying a change

`curl` shows only the server half. To check hydration you need a browser:

1. **Use the dev server (`pnpm dev` in this repository), not a production build.** Angular only checks that
   hydrated nodes match in dev mode. There, a claimed node has
   `node.__ngDebugHydrationInfo__.status === 'hydrated'`, and
   `ngDevMode.hydratedNodes` gives a running total. No console errors in a
   production build proves very little.
2. **Request every page at least twice on the same server process.** Angular's
   server-side `hydrate when` only throws NG0600 once a block's dependencies are
   cached in the isolate, which is from the second request on. A single request
   after a restart or an HMR update passes when it should not.
3. **Check that `window.__ngs` exists.** If it does not, the Worker fell back to
   the buffered render; look for the `[ssr]` log line.
4. **Separate the steps to see the ordering.** TMDB answers in about 70 ms
   locally, so every chunk usually lands before anything interesting can
   happen. To see a block hydrate after its chunk arrives, add a temporary
   `delay()` in the server branch of `streamHttpInterceptor`, a different one
   per URL. Remove it afterwards.
5. **Do not run the dev server and `preview` at the same time.** Both
   start workerd's inspector on port 9232, and the second one fails silently.

To log when chunks land relative to Angular, wrap `__ngs.push` and watch for
`__ngs.sink` being set, before any page script runs (for example with
`Page.addScriptToEvaluateOnNewDocument` over the Chrome DevTools Protocol).
