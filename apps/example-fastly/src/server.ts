/// <reference types="@fastly/js-compute" />
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { PublisherServer } from '@fastly/compute-js-static-publish';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
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

const render = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', '127.0.0.1'],
  // `index.html` is published as a hidden file: the template, never served as is.
  loadTemplate: async () => {
    const asset = await publisher.getMatchingAsset('/index.html', { includeHidden: true });
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

/** Compute entry: a published file if one matches, otherwise the streamed page. */
addEventListener('fetch', (event) =>
  event.respondWith(
    publisher
      .serveRequest(event.request, { fallback: false })
      .then((file) => file ?? renderPage(event)),
  ),
);
