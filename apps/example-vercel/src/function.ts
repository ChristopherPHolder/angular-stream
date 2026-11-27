import { readFile } from 'node:fs/promises';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { config } from './app/app.config.server';

/**
 * The page template: the built index.html with Angular's event dispatch
 * contract, which ngp writes next to this bundle. Read once per instance.
 */
const template = readFile(new URL('./index.server.html', import.meta.url), 'utf8');

const handle = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  allowedHosts: ['localhost', '*.vercel.app'],
  loadTemplate: async () =>
    new Response(await template, { headers: { 'content-type': 'text/html;charset=utf-8' } }),
});

/** Vercel Function entry (Node.js runtime): every page request is rendered as a streamed response. */
export default {
  fetch: (request: Request) => handle(request),
};
