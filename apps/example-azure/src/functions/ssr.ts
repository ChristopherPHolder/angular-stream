import { readFile } from 'node:fs/promises';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { HttpResponse, app } from '@azure/functions';
import { createStreamingHandler } from '@push-based/angular-ssr-stream-core/server';
import { config } from '../app/app.config.server';

// Without this, the Functions host reads the whole body before it sends a byte.
app.setup({ enableHttpStream: true });

// The built index.html, deployed with the function app and read once per instance.
const templateFile = new URL('../client/index.html', import.meta.url);
let template: Promise<string> | undefined;

function readTemplate(): Promise<string> {
  // A failed read isn't kept: the next request tries again.
  template ??= readFile(templateFile, 'utf8').catch((error: unknown) => {
    template = undefined;
    throw error;
  });
  return template;
}

const handle = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  loadTemplate: async () => new Response(await readTemplate()),
});

/** Every navigation. Static assets are served by the static host in front, never by this function. */
app.http('ssr', {
  route: '{*path}',
  methods: ['GET', 'HEAD'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const response = await handle(
      new Request(request.url, { method: request.method, headers: request.headers }),
    );

    // A HEAD request, such as a health probe, gets the status of a real render
    // once its shell is ready, and the render stops there.
    const head = request.method === 'HEAD';
    if (head) await response.body?.cancel();

    return new HttpResponse({
      status: response.status,
      headers: response.headers,
      body: head ? undefined : (response.body ?? undefined),
    });
  },
});
