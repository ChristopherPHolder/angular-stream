import { fileURLToPath } from 'node:url';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createNodeHandler } from '@push-based/angular-stream-node';
import compression from 'compression';
import express from 'express';
import { config } from './app/app.config.server';

/**
 * The Express server entry. Built to dist/server/server.js, next to the
 * template (dist/server/index.server.html) and one folder away from the
 * browser build (dist/client), which is where these URLs point.
 */
const handler = createNodeHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  template: new URL('./index.server.html', import.meta.url),
  // No `staticDir`: `express.static()` serves the browser build.
});

const client = fileURLToPath(new URL('../client/', import.meta.url));

const app = express();

// First, so that it wraps every response after it. The handler calls
// `res.flush()` after each chunk, so pages still stream.
app.use(compression());

// The browser build. Vite names the files in `assets/` by their content hash.
// `index: false`: `/` is a page, rendered by the handler, not the built index.html.
app.use('/assets', express.static(`${client}assets`, { immutable: true, maxAge: '1y' }));
app.use(express.static(client, { index: false }));

// Before the handler, which renders every `GET` that reaches it as a page.
app.get('/api/hello', (_req, res) => {
  res.json({ hello: 'from Express' });
});
app.use('/api', (_req, res) => {
  res.sendStatus(404);
});

// Everything else is a page.
app.get('/{*splat}', handler);

// `vite dev` imports this module for its default export, and serves it itself.
export default app;

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
