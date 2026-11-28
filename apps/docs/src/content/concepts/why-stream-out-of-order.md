Angular renders a page on the server and sends it whole, so a page is as slow
as its slowest request: if the product renders at once, the reviews take one
second and the recommendations three, the reader gets a blank page for three
seconds. There are two ways to stream instead:

- **In order.** HTML goes out top to bottom as it is ready. The top of the page
  arrives early, but a slow part still holds back everything below it.
- **Out of order.** Everything that is ready goes out at once, with a
  placeholder for each part that is not. Each part follows when its data
  arrives, in whatever order that is, and a script puts it in place.

All of them finish at the same moment; streaming does not make a slow request
faster. What changes is that the rest of the page, and the browser's work on
styles, fonts and scripts, no longer waits for it.

The idea is about fifteen years old, and each framework that has it gives the
same reason:

| When | Who                    | How a late part is placed                                    | In their words                                                                                             |
| ---- | ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 2010 | Facebook, [BigPipe][1] | A script call sets the placeholder's `innerHTML`             | "When the web server is busy generating a page, the browser is idle and wasting its cycles doing nothing." |
| 2014 | eBay, [Marko][2]       | Fragment in a hidden element, a script moves it to its id    | Without it, "the user will be staring at a blank screen for a large portion of the time."                  |
| 2021 | [React 18][3]          | Fallback first, then HTML and an inline script that swaps it | "Unlike traditional HTML streaming, it doesn't have to happen in the top-down order."                      |
|      | [Next.js][4]           | React's, per `<Suspense>` boundary or `loading.js`           | "A single slow database query or API call can block the entire page."                                      |
|      | [SvelteKit][5]         | Promises returned from a server `load` are streamed          | "This is useful if you have slow, non-essential data"                                                      |
|      | [Qwik][6]              | Experimental, inside `<Pending>`                             | "Out-of-order streaming helps when one section of the page is slow, but the rest of the page is ready."    |
| 2026 | [The browser][7]       | `<template for>` fills a `<?marker>`, with no script         | "primitives that have been part of userland libraries for about a decade"                                  |

The native version is new: Chrome's intent to ship targets version 150, and
[Chrome's guide][8] describes it as "shipped in only a single browser engine".
This project places late parts with a small inline script, as the libraries do.

Angular itself has no streaming, and its [roadmap][9] lists none;
[Does Angular support streaming SSR?](angular-streaming-ssr.md) shows where that
comes from. What it has is
[incremental hydration][10]: a `@defer` block with a `hydrate` trigger stays as
plain server HTML until the trigger fires. Angular is not touching that markup
yet, which is what lets the server replace it underneath a running application,
and it is the piece everything below builds on.

The costs are the same everywhere, and apply here:

- **The status code goes out with the shell.** A part that fails later cannot
  turn the response into an error page or a redirect.
- **Placeholders get replaced,** so content can shift unless each placeholder
  holds the room its content will need.
- **A late part needs JavaScript** to be put in place.
- **Streamed responses are not cached** as they stand; see
  [When something goes wrong](internals.md#when-something-goes-wrong).

[1]: https://engineering.fb.com/2010/06/04/web/bigpipe-pipelining-web-pages-for-high-performance/
[2]: https://calendar.perfplanet.com/2014/async-fragments-rediscovering-progressive-html-rendering-with-marko/
[3]: https://github.com/reactwg/react-18/discussions/37
[4]: https://nextjs.org/docs/app/guides/streaming
[5]: https://svelte.dev/docs/kit/load
[6]: https://next.qwik.dev/docs/labs/suspense/
[7]: https://groups.google.com/a/chromium.org/g/blink-dev/c/eAUPFR-sloc
[8]: https://developer.chrome.com/docs/modern-web-guidance/guides/performance/out-of-order-html-streaming
[9]: https://angular.dev/roadmap
[10]: https://angular.dev/guide/incremental-hydration
