/// <reference types="@fastly/js-compute" />
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { PublisherServer } from '@fastly/compute-js-static-publish';
import { createStreamingHandler } from '@push-based/angular-ssr-stream-core/server';
import rc from '../static-publish.rc.js';
import { config } from './app/app.config.server';

// Compute's engine has no `URL.canParse()`, and Angular's server renderer calls it.
if (typeof URL.canParse !== 'function') {
  URL.canParse = (url: string | URL, base?: string | URL) => {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}

/** The files of `dist/client`, from the KV Store the static publisher fills. */
const publisher = PublisherServer.fromStaticPublishRc(rc);

/** The template's key in the KV Store. The publisher would serve it as a file at this path. */
const templatePath = '/index.html';

const allowedHosts = ['localhost', '127.0.0.1'];

const render = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts,
  loadTemplate: async () => {
    const asset = await publisher.getMatchingAsset(templatePath);
    const file = asset && (await publisher.loadAssetVariant(asset, null));
    return file ? new Response(file.storageEntry.body) : new Response(null, { status: 404 });
  },
});

/**
 * The page, kept running for one task after its body ends. The renderer tears
 * Angular down a task after the last chunk, and Compute stops the instance as
 * soon as the body is done, with an error while a timer is still pending.
 */
async function renderPage(event: FetchEvent): Promise<Response> {
  const response = await render(event.request);
  if (response.body === null) {
    return response;
  }

  let ended!: () => void;
  event.waitUntil(
    new Promise<void>((resolve) => (ended = resolve)).then(
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    ),
  );

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          ended();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        ended();
      }
    },
    cancel(reason) {
      ended();
      return reader.cancel(reason);
    },
  });

  return new Response(body, response);
}

/**
 * The path the publisher looks a file up by: it matches the decoded path exactly,
 * so `/%69ndex.html` is `/index.html` and `/INDEX.HTML` is no file. `null` if
 * the path doesn't decode.
 */
function publishedPath(url: URL): string | null {
  try {
    return decodeURI(url.pathname);
  } catch {
    return null;
  }
}

/**
 * A page's headers without its body. Compute doesn't cancel a JS body nobody
 * reads, so a rendered page would run to its end for a `HEAD`, and the instance
 * would then exit with an error.
 */
function headPage(url: URL): Response {
  if (!allowedHosts.includes(url.hostname)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Compute entry: a published file if one matches, a 404 for a missing hashed
 * asset, otherwise the streamed page. `/index.html` is the template, so it is
 * rendered like any other page and never served as a file.
 */
async function handleRequest(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const path = publishedPath(url);
  if (path === null) {
    return new Response('Bad request.', { status: 400 });
  }

  if (path !== templatePath) {
    const file = await publisher.serveRequest(event.request);
    if (file !== null && event.request.method === 'HEAD') {
      // The publisher's body checks the file's length as it is read: drop it.
      await file.body?.cancel();
      return new Response(null, file);
    }
    if (file !== null) {
      return file;
    }
    if (path.startsWith('/assets/')) {
      return new Response('Not found.', { status: 404 });
    }
  }

  return event.request.method === 'HEAD' ? headPage(url) : renderPage(event);
}

addEventListener('fetch', (event) => event.respondWith(handleRequest(event)));
