import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import { ExamplePage } from '@angular-stream/stream-example';
import { angularStream } from '@push-based/angular-stream-fastify';
import Fastify from 'fastify';
import { config } from './app/app.config.server';

/**
 * The Fastify server entry. Built to dist/server/server.js, next to the
 * template (dist/server/index.server.html) and one folder away from the
 * browser build (dist/client), which is where these URLs point.
 */
const app = Fastify({ logger: true });

// Before the routes it compresses. `flushOnIdle` sends each chunk of a page
// as it comes, instead of the whole page at the end.
app.register(fastifyCompress, { flushOnIdle: true });

// The API, in a plugin so that its routes are added once @fastify/compress has loaded.
app.register(
  async (api) => {
    api.get('/health', async () => ({ status: 'ok' }));
    // Any other URL under /api is a 404, not a page.
    api.get('/*', (_request, reply) => reply.callNotFound());
  },
  { prefix: '/api' },
);

if (import.meta.env.PROD) {
  // The browser build, one route per file; `vite dev` serves these itself.
  // Not `wildcard: true`, the default: its `GET /*` would clash with the pages'.
  app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../client/', import.meta.url)),
    wildcard: false,
    // `index.html` is the template, not a page: `/` is rendered.
    globIgnore: ['**/*.html'],
  });
  // A hashed file that no longer exists (an old chunk after a deploy) is a 404,
  // not a page. Each real file's own route is more specific, so it still wins.
  app.get('/assets/*', (_request, reply) => reply.callNotFound());
}

// Every other `GET` and `HEAD` is a page.
app.register(angularStream, {
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  template: new URL('./index.server.html', import.meta.url),
});

/**
 * `vite dev` calls this for each page request, with the dev template on `req`
 * and `req.url` rewritten to `/index.html`, and for each request under `/api`;
 * Fastify routes the URL the browser asked for.
 */
export default function handle(
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  next: (error?: unknown) => void,
): void {
  req.url = req.originalUrl ?? req.url;
  app.ready().then(() => app.routing(req, res), next);
}

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  app.listen({ port }).catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
}
