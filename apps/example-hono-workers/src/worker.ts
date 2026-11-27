import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { Hono } from 'hono';
import { config } from './app/app.config.server';

const angular = createStreamingWorker({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
});

/** Hono routes the API; every other request is a page, rendered by the Worker as a stream. */
const app = new Hono<{ Bindings: Env }>();
app.get('/api/hello', (c) => c.json({ hello: 'from Hono' }));
// Cloudflare serves the files that exist, so an /assets/ request that gets here is
// a missing hashed file (an old chunk after a deploy): a 404, not a page.
app.get('/assets/*', (c) => c.notFound());
app.get('*', (c) => angular.fetch(c.req.raw, c.env));

export default app satisfies ExportedHandler<Env>;
