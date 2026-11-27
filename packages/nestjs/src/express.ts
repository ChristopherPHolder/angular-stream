import type { ServerResponse } from 'node:http';
import { NotFoundException } from '@nestjs/common';
import type { AbstractHttpAdapter } from '@nestjs/core';
import {
  type NodeRequest,
  type StaticHandler,
  createNodeHandler,
  createStaticHandler,
} from '@push-based/angular-stream-node';
import { toNestError } from './errors';
import type { AngularStreamModuleOptions } from './options';
import { isUnderPrefix } from './prefix';

type Next = (error?: unknown) => void;

/**
 * Adds the render route to a Nest app on `@nestjs/platform-express`: one
 * middleware on the Express app, which comes after everything registered
 * before it.
 */
export function addExpressRenderer(
  adapter: AbstractHttpAdapter,
  options: AngularStreamModuleOptions,
  prefix: string | null,
): void {
  const { staticDir } = options;
  const handler = createNodeHandler(options);
  const serveStatic: StaticHandler =
    staticDir === undefined ? async () => false : createStaticHandler(staticDir);

  // Middleware, not a route: it passes methods other than GET and HEAD on,
  // and errors before the response has started, to Nest's own handlers.
  adapter.use((req: NodeRequest, res: ServerResponse, next: Next) => {
    const target = req.originalUrl ?? req.url ?? '/';
    // Under the global prefix, a request no controller took is Nest's 404.
    if (prefix !== null && isUnderPrefix(target, prefix)) {
      next();
      return;
    }
    // Vite's hashed build output. A file that isn't there, such as an old
    // chunk after a deploy, is a 404 rather than a page.
    if (isUnderPrefix(target, '/assets')) {
      serveStatic(req, res).then((served) => {
        if (!served) {
          next(new NotFoundException(`Cannot ${req.method} ${target}`));
        }
      }, next);
      return;
    }
    handler(req, res, (error?: unknown) => next(toNestError(error)));
  });
}
