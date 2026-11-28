A streamed page is sent before it is finished, and that changes a few things a
server-rendered app usually takes for granted: the status code, what crawlers
and caches get, the security policy, and how the page loads. This page goes
through them, and ends in a checklist.

## Status codes and redirects

The status and headers go out with the shell, before any data has arrived. A
request that fails later can't turn the response into an error page, and a
`404` has to be known before the first byte.

- **With the Angular CLI**, `@angular/ssr` keeps its server routes, so give a
  route its `status` there, and its redirects. A component can still set
  `RESPONSE_INIT` until the shell goes out: decide the status from the URL, or
  from a route resolver, whose data is there before the route renders. Anything
  that arrives with a chunk comes too late. See
  [What `@angular/ssr` still does](../getting-started/angular-cli.md#what-angularssr-still-does).
- **On the other setups** every page is a `200`, a not-found page included.
  A server that knows its routes sets the status from outside, keeping the
  streamed body, as [the demo's Worker](../../../../cloudflare-demo/src/worker.ts)
  does:

  ```ts
  const response = await pages.fetch(request, env);
  if (isPage(url.pathname) || !response.ok) {
    return response;
  }
  return new Response(response.body, { status: 404, headers: response.headers });
  ```

  Redirects are the same: answer them before the request reaches the handler.

A page that loads and then finds out its data doesn't exist, a product that was
deleted, still answers `200`. Show a not-found state in the block, and keep
such pages out of search with `<meta name="robots" content="noindex">` set in
the shell, if the route can tell by then.

## Crawlers and metadata

Crawlers get the same stream as everyone. One that runs scripts, as Google's
does, sees the page as a reader does, once the stream has ended. One that
doesn't keeps the shell: each block's loading state, with the streamed markup
in `<template>` elements at the end of the document, which isn't part of the
rendered page. There is no buffered render that includes the blocks either:
the fallback leaves them to the browser too. Whatever must be read without
scripts belongs in the shell.

The document's `<head>` is part of the shell, so the same goes for metadata:

- **A title or a meta tag set before the shell goes out is in the server's
  HTML**: one set from the URL, from route data, or in a resolver.
- **One set from data that streams in later is set in the browser only.**
  The server's HTML keeps whatever it had, so a crawler that doesn't run
  scripts, and a link preview, see that.

So set a page's title, description and `og:*` tags from something the route
knows when it renders. A resolver that loads them holds the shell back for
that one request, which is the trade: everything else still streams.

## Content Security Policy

The packages put inline scripts in the page: the runtime at the end of the
shell, and one per chunk, with a `<style>` before it when a component new to
the page brings its styles. None of them carries a nonce yet (see
[Caveats and limitations](../reference/limitations.md#streaming)).

- **A policy with `'unsafe-inline'` in `script-src` and `style-src`** works,
  and is what a streamed page needs today.
- **A strict policy, nonces or `'strict-dynamic'`,** blocks the runtime and
  every chunk. The browser keeps the shell, and the streamed parts never
  arrive. Hashes don't help: each chunk's script is different.
- **Angular's own `ngCspNonce`** covers the styles Angular adds itself, not
  these scripts.

Check a policy in the browser's console: a blocked chunk logs a CSP violation,
and `window.__ngs` is missing or never reaches `done`.

## Caching

Streamed responses carry `Cache-Control: no-store`: a cached copy of a response
that broke off would be worse than none. With the Angular CLI, that holds for
streamed routes whatever the route's `headers` say.

- **The browser build is cacheable as usual.** The files under `assets/` are
  named by their content, so they can be cached for a year.
- **Cache the data, not the page.** The page waits for its API, so a cache in
  front of the API, or in the server, speeds up every chunk.
- **A route that should be cached shouldn't stream.** With the Angular CLI,
  give it another render mode: `RenderMode.Prerender` writes it at build time.

## Web Vitals

Streaming doesn't make a slow request faster. It changes what the reader gets
before it.

- **TTFB and FCP** come from the shell, so they no longer wait for the slowest
  request. This is where streaming shows most.
- **LCP** is when the largest element paints. If it is in the shell, a heading
  or an image that doesn't depend on data, it paints with the shell. If it is
  inside a block, LCP waits for that block's chunk, as it would have waited for
  the whole page.
- **CLS** grows when a placeholder is replaced by content of another size, and
  the page below it moves. Give each placeholder the room its content will
  take, such as a `min-height` or a skeleton of the same size.
- **INP** benefits from the shell hydrating early: it answers clicks while the
  rest is still arriving. Clicks inside a block only work once it has
  hydrated, and clicks before Angular starts are replayed for the event types
  the shell listens to.

Measure on a throttled connection, where the difference is: the Performance
panel in Chrome's DevTools, with "Slow 4G", shows the shell, each chunk and each
paint on one timeline. Then compare with your field data.

## Request context

- **With the Angular CLI**, `@angular/ssr` provides `REQUEST`, so the app can
  read the incoming request's cookies and headers, and forward them to its own
  API with an interceptor, as it would without streaming. `REQUEST` is `null`
  in the browser.
- **On the other setups**, `createStreamingHandler()` and the adapters built on
  it don't hand the request to the app: `REQUEST` isn't provided. A server that
  needs it renders with
  [`renderStreamingAngular()`](../reference/core.md#renderstreamingangular)
  itself, passing `{ provide: REQUEST, useValue: request }` in
  `platformProviders`. The handler's host check and its buffered fallback are
  then yours to keep.

## Proxies and timeouts

A proxy, a CDN, a load balancer or compression in front of the server can hold
the page back until it is complete, and a timeout can cut a page whose slowest
request takes too long. [Streaming through proxies](streaming-through-proxies.md)
covers each, and how to check every hop.

## Checklist

Before a streamed page goes live:

- Every page that should be a `404` answers `404`, decided before the shell.
- Titles, descriptions and `og:*` tags are in the server's HTML.
- What must be indexed without scripts is in the shell.
- The Content Security Policy lets inline scripts and styles run.
- `allowedHosts` lists every hostname, previews included.
- Every placeholder holds the room its content takes.
- Each request a block waits for has a `timeout()` and an error state; see
  [When a request fails](making-something-stream.md#when-a-request-fails).
- The data the page waits for is cached where it can be.
- The deployed page streams through every hop, checked with `curl`.
- Event replay is on: `eventDispatchContract` is passed where the template
  lacks it.
