import type { ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { NodeHandler, NodeRequest } from '@push-based/angular-stream-node';

type Next = (error?: unknown) => void;
type ExpressApp = (req: NodeRequest, res: ServerResponse, next?: Next) => void;

/**
 * A `node:http` request listener, `(req, res, next?)`, that hands each request
 * to a Nest application on `@nestjs/platform-express`: the server entry's
 * default export, which the Vite plugin calls in `vite dev`.
 *
 * The first request initializes the app (`app.init()`), which registers its
 * routes and the render route; `app.listen()` does the same in production, so
 * a server entry can export this and still call `listen()` itself.
 *
 * Express routes on `req.url`, which Vite's HTML fallback has rewritten to
 * `/index.html` for a page. The listener puts back `originalUrl`, the URL that
 * was asked for, so Nest's routes and the global prefix see that.
 */
export function createRequestListener(app: INestApplication): NodeHandler {
  let ready: Promise<ExpressApp> | undefined;

  return (req, res, next) => {
    ready ??= app.init().then(() => app.getHttpAdapter().getInstance() as ExpressApp);
    ready.then(
      (express) => {
        if (req.originalUrl !== undefined) {
          req.url = req.originalUrl;
        }
        express(req, res, next);
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
