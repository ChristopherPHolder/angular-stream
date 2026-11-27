import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { config } from './app/app.config.server';

/** The browser build. This file is built to dist/server/server.js, next to it. */
const client = `${import.meta.dir}/../client`;

/** The built `index.html`, read once: every page is rendered into it. */
const template = await Bun.file(`${client}/index.html`).text();

const handle = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  loadTemplate: async () => new Response(template),
});

/** Every built file but the template, each as its own route, so it's served before the renderer. */
const routes: Record<string, Bun.BunFile> = {};
for await (const path of new Bun.Glob('**/*').scan(client)) {
  if (path !== 'index.html') {
    routes[`/${path}`] = Bun.file(`${client}/${path}`);
  }
}

const server = Bun.serve({
  port: Number(process.env['PORT'] ?? 3000),
  routes,
  // Every other request is a page.
  fetch: (request) => handle(request),
});

console.log(`Listening on ${server.url}`);
