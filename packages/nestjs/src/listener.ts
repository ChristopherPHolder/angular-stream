import type { ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { NodeHandler, NodeRequest } from '@push-based/angular-ssr-stream-node';
import type { FastifyInstance } from 'fastify';

type Next = (error?: unknown) => void;
type Listener = (req: NodeRequest, res: ServerResponse, next?: Next) => void;

/**
 * A `node:http` request listener, `(req, res, next?)`, that hands each request
 * to a Nest application on `@nestjs/platform-express` or
 * `@nestjs/platform-fastify`: the server entry's default export, which the
 * Vite plugin calls in `vite dev`.
 *
 * The first request initializes the app (`app.init()`), which registers its
 * routes and the render route, and on Fastify starts the instance
 * (`ready()`); `app.listen()` does the same in production, so a server entry
 * can export this and still call `listen()` itself.
 *
 * Vite's HTML fallback has rewritten a page's `req.url` to `/index.html`. The
 * listener puts back `originalUrl`, the URL that was asked for, so Nest's
 * routes and the global prefix see that.
 */
export function createRequestListener(app: INestApplication): NodeHandler {
  let ready: Promise<Listener> | undefined;

  return (req, res, next) => {
    ready ??= app.init().then(async () => {
      const adapter = app.getHttpAdapter();
      if (adapter.getType() !== 'fastify') {
        return adapter.getInstance() as Listener;
      }
      const fastify = adapter.getInstance() as FastifyInstance;
      await fastify.ready();
      // Fastify's router, as its own server calls it. It answers every
      // request itself, a 404 included, so `next` is never needed.
      const listener: Listener = (request, response) => fastify.routing(request, response);
      return listener;
    });
    ready.then(
      (listener) => {
        if (req.originalUrl !== undefined) {
          req.url = req.originalUrl;
        }
        listener(req, res, next);
      },
      (error: unknown) => {
        if (next) {
          next(error);
          return;
        }
        console.error('[ssr] the Nest application failed to start', error);
        res.statusCode = 500;
        res.end('Internal server error.');
      },
    );
  };
}
