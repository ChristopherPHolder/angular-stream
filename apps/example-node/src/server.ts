import { createServer } from 'node:http';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { createNodeHandler } from '@push-based/angular-ssr-stream-node';
import { config } from './app/app.config.server';

/**
 * The Node server entry. Built to dist/server/server.js, next to the template
 * (dist/server/index.server.html) and one folder away from the browser build
 * (dist/client), which is where these URLs point.
 */
const handler = createNodeHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  template: new URL('./index.server.html', import.meta.url),
  staticDir: new URL('../client/', import.meta.url),
});

// `vite dev` imports this module for its default export, and serves it itself.
export default handler;

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  createServer(handler).listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
