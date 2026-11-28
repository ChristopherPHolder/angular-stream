Angular renders a page on the server and sends it whole, so the page is as slow
as its slowest request. angular-ssr-stream sends it in pieces instead, over one
response:

1. **Shell.** The server bootstraps, waits for the route and its `@defer` blocks
   to exist (not for their data) and sends that state, annotated for hydration,
   with the entry script at the end marked `async`. The browser loads Angular
   and hydrates the shell while the response is still open.
2. **Chunks.** Each time a request finishes and the application has rendered
   the result, the server sends every `@defer` block that changed: its markup in
   a `<template>`, then an inline script carrying the block's hydration data and
   the transfer state the change came from. The script swaps the markup in front
   of the block's anchor comment, whether or not Angular is running yet.
3. **Hydration.** The block hydrates against the streamed markup when its
   trigger fires. Nothing is fetched twice: a request the server is already
   making is held back in the browser until its response arrives on the stream.

The page is usable as soon as its shell is, and each slow part fills in when
its own data is there, in whatever order that happens.

## See it

- **[The demo](https://angular-ssr-stream-demo.chris-holder.workers.dev/)** shows
  the same page sent three ways on one clock, one response stepped through
  piece by piece, a single streamed widget with the code for it, and every
  flush of a real response as it arrives.
- **[Angular Movies](https://angular-ssr-stream-movies.chris-holder.workers.dev/)** is the
  same technique on a real app, backed by the TMDB API.

## The packages

| Package                                                                   | What it is                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`@push-based/angular-ssr-stream-core`](../reference/core.md)             | The renderer, its inline runtime and the client. Runtime-agnostic: web `Request`, `Response` and streams. |
| [`@push-based/angular-ssr-stream-node`](../reference/node.md)             | `createNodeHandler()`: a Node request handler for `node:http`, Express, Connect and Koa.                  |
| [`@push-based/angular-ssr-stream-fastify`](../reference/fastify.md)       | `angularStream`: a Fastify plugin that streams every page route.                                          |
| [`@push-based/angular-ssr-stream-nestjs`](../reference/nestjs.md)         | `AngularStreamModule`: a Nest module, on Express or on Fastify.                                           |
| [`@push-based/angular-ssr-stream-cloudflare`](../reference/cloudflare.md) | `createStreamingWorker()`: a Cloudflare Worker `fetch` handler over the `ASSETS` binding.                 |
| [`@push-based/angular-ssr-stream-aws-lambda`](../reference/aws-lambda.md) | `createStreamingLambda()`: a response-streaming handler for a Lambda Function URL.                        |
| [`@push-based/angular-ssr-stream-nitro`](../reference/nitro.md)           | `defineStreamingHandler()`: an h3 handler for a Nitro server.                                             |

An app uses both halves of the core: providers in its browser config, and a
server entry that streams. The server entry is where runtimes differ. A runtime
that hands the server a web `Request` and takes a `Response` back (Hono, Deno,
Bun, Fastly Compute, Vercel, Netlify, Azure Functions) needs only the core's
[`createStreamingHandler()`](../reference/core.md#createstreaminghandler). The
others get a small adapter over it, which is what the rest of the packages are.

## Where to go next

- [Installation](installation.md): what the packages need, and which of them
  your runtime takes.
- Your runtime's setup page, from [the table there](installation.md#install) or
  under "Runtimes" in the contents: the whole setup, from the app config to
  running it.
- [Making something stream](../guides/making-something-stream.md): which parts
  of a template stream, and how to write them.
- [Why stream out of order](../concepts/why-stream-out-of-order.md): what it
  buys, and how other frameworks came to it.
