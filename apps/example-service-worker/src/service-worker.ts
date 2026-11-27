import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { files, version } from 'virtual:precache';
import { config } from './app/app.config.server';

/**
 * The parts of the Service Worker global scope used here. The app's tsconfig
 * has the DOM lib, which can't be combined with the WebWorker one.
 */
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface ServiceWorkerScope {
  readonly location: Location;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
}

const worker = self as unknown as ServiceWorkerScope;

/** One cache per build: the template, the client's scripts and the icons. */
const CACHE_PREFIX = 'angular-stream-';
const CACHE = `${CACHE_PREFIX}${version}`;

/** Milliseconds from the worker's start to this script having run, for `Server-Timing`. */
const bootMs = performance.now();

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

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(files))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => worker.clients.claim()),
  );
});

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

/** Every navigation is rendered here, streamed, with the worker's start-up time attached. */
async function renderPage(request: Request): Promise<Response> {
  const response = await render(request);
  const headers = new Headers(response.headers);
  headers.set('Server-Timing', `sw-boot;dur=${bootMs.toFixed(1)}`);

  return new Response(response.body, { status: response.status, headers });
}
