> [!WARNING]
> Experimental. This is a working demo, not a supported setup: there is no
> package for it, and it was checked in Chrome only.

A Service Worker's `fetch` handler takes a `Request` and returns a `Response`,
which is exactly what the core handler does. So the whole renderer
(`@angular/platform-server`, domino and `createStreamingHandler()`) can run in
the browser's own Service Worker. After the first visit, every navigation is
rendered there and streamed into the page, with no server involved, offline
included.

[`apps/example-service-worker`](../../../../../apps/example-service-worker/src/service-worker.ts)
is the working example. It renders the same page as the other runtime examples:
a shell sent at once, and a widget whose data (from an in-process fake API)
arrives 2 s later and is streamed in.

## What happens

1. **First visit.** Any static server sends the built `index.html`. The app is
   rendered in the browser, as a plain client-side app would be, and registers
   `/sw.js`.
2. **Install.** The worker caches the template (`index.html`), the client's
   scripts and the icons, all under one cache named after the build.
3. **Every navigation after that.** The worker renders the route into the cached
   template and streams it: the shell, then each `@defer` block as its data
   arrives. The page hydrates the shell while the response is still open, as it
   does with a server. Scripts and icons come from the cache.

Nothing in step 3 touches the network, so it works offline.

## Try it

In a checkout of the repository:

```bash
pnpm install
pnpm nx build example-service-worker
cd apps/example-service-worker && pnpm exec vp preview
```

Open the page once, then reload: the page is now rendered by the worker.
`window.__ngs` exists, and the widget says it was answered by the "server",
which is the worker here. Then stop `vp preview`, or tick _Offline_
in DevTools, and reload again. The shell still comes at once and the widget
2 s later.

In your own app, `vite build` and `vite preview` do the same. `vite dev` serves
the app client-rendered only: the worker is part of the build, and `main.ts`
registers it in production builds only.

## The setup

<!-- include ../_shared/before-you-start.md -->

```bash
npm install @push-based/angular-ssr-stream-core@next
```

### The browser config

<!-- include ../_shared/browser-config.md -->

### The server config

<!-- include ../_shared/server-config.md -->

What differs from a server is the worker, its registration and the build.

### The worker

```ts title="src/service-worker.ts"
const render = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: [worker.location.hostname],
  // The built index.html, cached on install: the same template a server renders into.
  // A worker's own `fetch()` skips its `fetch` handler, so the fallback goes to the network.
  loadTemplate: async (request) =>
    (await fromCache('/index.html')) ?? fetch(new URL('/index.html', request.url)),
});

/**
 * A file from this build's cache. `ignoreVary`, since a static server may send
 * `Vary: Origin` (Vite's preview does), and a module script's request carries
 * an `Origin` header that the request it was cached with didn't: without it,
 * the entry script would miss the cache and fail offline.
 */
function fromCache(request: Request | string): Promise<Response | undefined> {
  return caches.match(request, { cacheName: CACHE, ignoreVary: true });
}

worker.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || new URL(request.url).origin !== worker.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(renderPage(request));
    return;
  }

  // Everything else the page loads is in the cache; the network is the fallback.
  event.respondWith(fromCache(request).then((cached) => cached ?? fetch(request)));
});
```

`install` caches the build's files and calls `skipWaiting()`; `activate`
deletes the caches of earlier builds and calls `clients.claim()`, so the page
that installed the worker is controlled straight away.
[The full file](../../../../../apps/example-service-worker/src/service-worker.ts)
also adds a `Server-Timing: sw-boot;dur=…` header to the first page a worker
answers after it starts: how long it took to start and run its script, shown
in DevTools under the navigation's _Timing_ tab. A page the worker can't
render falls back to the network, so a broken worker build doesn't take the
site down. The install step fetches with `cache: 'reload'`, past the HTTP
cache, so a host that sends `max-age` can't hand a new worker the previous
build's `index.html`.

`allowedHosts` is the worker's own hostname: it only ever sees navigations to
its own origin.

The `ignoreVary` matters. Without it, the module script's request (which
carries `Origin`) missed the cache entry that `cache.addAll()` stored without
one, fell through to the network, and the page streamed offline but never
hydrated.

### Registering it

```ts title="src/main.ts"
bootstrapApplication(ExamplePage, appConfig).catch((error) => console.error(error));

// The first visit is served as it is; from the next navigation on, the worker renders the page.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error) => console.error(error));
}
```

### The build

The worker is a third Vite environment next to the client: Angular compiled
with ngp's server compiler (it is a `server` consumer, so `ngServerMode` is
`true`), resolved with browser conditions, bundled into one classic script. A
Service Worker can't `import()`, and an IIFE has no chunks to import, so the
`@defer` dependencies are inlined.

```ts title="vite.config.ts"
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  build: { outDir: OUT_DIR },
  builder: {
    // The worker caches what the client build wrote, so the client goes first.
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.worker);
    },
  },
  environments: {
    // The Service Worker: Angular's server renderer and the app, in one classic script.
    worker: {
      consumer: 'server',
      resolve: {
        conditions: ['worker', 'browser', 'module', 'default'],
        noExternal: true,
      },
      build: {
        outDir: OUT_DIR,
        emptyOutDir: false,
        copyPublicDir: false,
        minify: true,
        rolldownOptions: {
          input: 'src/service-worker.ts',
          output: { format: 'iife', entryFileNames: WORKER_FILE },
        },
      },
    },
  },
  plugins: lazyPlugins(() => [
    ngp({ entries: ['src/main.ts', 'src/service-worker.ts'] }),
    precache(),
  ]),
});
```

`precache()`, in the
[same file](../../../../../apps/example-service-worker/vite.config.ts), is a
small plugin: when the worker is built, it lists what the client build wrote
to `dist/` and hands it to the worker as `virtual:precache`, with a hash of
the files. The hash names the cache and changes `sw.js`, so each build
installs a new worker.

## What it costs

Measured with the example on an Apple M4 Max, in headless Chrome 158, served by
`vp preview`.

| Measured                                   | Result                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `sw.js`, minified                          | 463 kB, 142 kB gzipped                                                                                      |
| `sw.js`, unminified                        | 992 kB, 214 kB gzipped                                                                                      |
| The client bundle, for comparison          | 191 kB, 63 kB gzipped                                                                                       |
| Worker start-up, first start after install | 21–35 ms                                                                                                    |
| Worker start-up, later cold starts         | 5–9 ms                                                                                                      |
| Shell in the page, worker running          | 5–10 ms after navigation start                                                                              |
| Shell in the page, worker stopped          | 13–24 ms                                                                                                    |
| Widget chunk in the page                   | 2003–2022 ms                                                                                                |
| Widget hydrated                            | 2–10 ms after its chunk; about 230 ms on the first render after an install, while the lazy chunk loads cold |

_Start-up_ is the time from the worker's start to its script having run (the
`sw-boot` value). Chrome keeps the compiled script of an installed worker,
which is why later cold starts are four times faster than the first. A cold
start is what an idle worker pays: Chrome stops it after about 30 s without
events. Chrome's CPU throttling applies to pages, not workers ("only supported
for pages"), so there is no slower-CPU figure; expect a phone to take several
times these numbers.

Of the unminified bundle, about 45% is `@angular/platform-server` (domino
included) and a third is `@angular/core`; rxjs, `@angular/common`,
`@angular/platform-browser` and angular-ssr-stream's core make up most of the
rest. About 20 kB is `xhr2`, which platform-server only loads for
`withXhr()` and which never runs here.

The 142 kB is downloaded once, in the background after the first visit, and
again with every new build. Installing also fetches the client's files once
more, into the worker's cache.

## Things to know

- **Real data needs a cache of its own.** The example's data comes from an
  in-process fake API. `HttpClient` uses `fetch` by default in Angular 22, which
  a worker has; don't add `withXhr()`, since a worker has no `XMLHttpRequest`
  and the `xhr2` package platform-server loads instead needs Node's `http`. The
  worker's `fetch` goes straight to the network (a worker's own requests skip
  its `fetch` handler), so for data offline, the worker's config needs an
  interceptor that reads and fills a cache. That wasn't tried here.
- **The first visit isn't streamed** by this setup; it is whatever the server
  sends. A streaming server for the first visit and this worker for the rest
  should combine, but that wasn't tried.
- **Updates replace everything at once.** A new build installs a new worker,
  which takes over open tabs and deletes the old cache. From then on, any old
  file a tab still running the old build asks for (a lazy chunk, an image) goes
  to the network, online too. On a host that doesn't keep the previous build's
  hashed files, that's a 404: a chunk that won't load, or a page that doesn't
  hydrate. Keep the previous build's assets deployed, or reload open tabs when
  a new worker takes over.
- **Every navigation is a page.** The worker renders every same-origin
  navigation, so opening `/sw.js` or a script in a tab, or an unknown path,
  gets the rendered app with status 200.
- **Search engines and link previews** never run a Service Worker. They get
  the first-visit page.
- **Only Chrome was checked.** Streaming a `ReadableStream` body through
  `respondWith()` is part of the standard, but Firefox and Safari weren't tried
  with this example.
- **One thread for every tab.** All tabs of the origin share one worker, so
  their renders share its thread.

## Next to `@angular/service-worker`

Only one Service Worker controls a scope. Angular's `ngsw-worker.js` calls
`event.respondWith()` for nearly every request in its scope, and answers navigations
with the cached `index.html`: an app shell the browser then renders. This
experiment replaces exactly that answer with a rendered, streamed page.

To keep Angular's worker for the rest (asset groups, data groups, update
checks, push), a script of your own could add its `fetch` listener first,
answer navigations with the renderer, call `event.stopImmediatePropagation()`
so Angular's listener doesn't answer them too, and then load Angular's worker
with `importScripts('./ngsw-worker.js')`. The template would still need a
cache of its own: Angular's cache names are internal, and the worker can't
`fetch()` through itself. Without the Angular CLI, `ngsw.json` comes from the
`ngsw-config` binary that `@angular/service-worker` ships
(`ngsw-config dist ngsw-config.json`). None of this was tried here.

## When it's worth it

- **It is** for an installable or offline-first app whose pages should look
  rendered, not blank, on a flaky network or none, and whose data can be
  produced or cached on the device.
- **It isn't** for an app that is online and already served by a streaming
  server: the server's first byte is as fast, and the worker adds 142 kB and a
  second place where the app renders. Nor does it help the first visit, search
  engines or link previews.

## Stream something

<!-- include ../_shared/stream-something.md -->
