import type { ServerResponse } from 'node:http';
import {
  type StreamingAppOptions,
  createStreamingHandler,
} from '@push-based/angular-stream-core/server';
import { BadRequestError, type NodeRequest, toWebRequest } from './request';
import { sendWebResponse } from './response';
import { createStaticHandler } from './static';
import { createTemplateLoader } from './template';

export interface NodeHandlerOptions extends StreamingAppOptions {
  /**
   * The built template every page is rendered into, as a path or a `file:`
   * URL: with ngp's `ssr` option, `dist/server/index.server.html`. Read from
   * disk on the first request, then kept in memory.
   */
  template: string | URL;
  /**
   * The browser build (`dist/client`), to serve its files from. Leave it out
   * when something in front already serves them (`express.static`, a CDN,
   * Nginx): every request that reaches the handler is then rendered as a page.
   */
  staticDir?: string | URL;
  /**
   * Take the protocol and host from `X-Forwarded-Proto` and `X-Forwarded-Host`.
   * Turn this on only behind a proxy that sets them. Default: `false`.
   */
  trustProxy?: boolean;
}

/**
 * `(req, res, next?)`: a `node:http` request listener, and Connect and Express
 * middleware. As middleware, it passes requests other than `GET` and `HEAD` on
 * to `next`.
 */
export type NodeHandler = (
  req: NodeRequest,
  res: ServerResponse,
  next?: (error?: unknown) => void,
) => void;

/**
 * A Node request handler that streams the application: the core's
 * `createStreamingHandler()`, with the template read from disk, the browser
 * build served from `staticDir`, and the response written to the socket chunk
 * by chunk.
 *
 * Pages are `GET` and `HEAD` requests. Given `next`, as middleware, the handler
 * passes every other method on to it, so routes mounted after it still get
 * their `POST`s; without `next`, it renders them as pages too.
 *
 * When the client goes away mid-render, the render stops. An error is passed
 * to `next` when there is one; otherwise the handler answers 500 (400 for a
 * `BadRequestError`), or cuts the connection when the response has already
 * started.
 */
export function createNodeHandler(options: NodeHandlerOptions): NodeHandler {
  const { template, staticDir, trustProxy, ...app } = options;
  const serveStatic = staticDir === undefined ? null : createStaticHandler(staticDir);
  const render = createStreamingHandler<NodeRequest>({
    ...app,
    // In `vite dev`, it takes the dev server's template from the request.
    loadTemplate: createTemplateLoader(template),
  });

  const handle = async (
    req: NodeRequest,
    res: ServerResponse,
    next?: (error?: unknown) => void,
  ): Promise<void> => {
    if (next && req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    try {
      if (serveStatic !== null && (await serveStatic(req, res))) {
        return;
      }
      const response = await render(toWebRequest(req, res, { trustProxy }), req);
      // Nginx buffers proxied responses unless told not to, which would hold
      // the shell back until the last chunk. Other proxies ignore it.
      if (response.body !== null && !response.headers.has('x-accel-buffering')) {
        res.setHeader('X-Accel-Buffering', 'no');
      }
      await sendWebResponse(res, response);
    } catch (error) {
      if (next) {
        next(error);
        return;
      }
      if (res.headersSent) {
        console.error('[ssr] request failed', error);
        res.destroy();
      } else if (error instanceof BadRequestError) {
        res.statusCode = error.status;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(error.message);
      } else {
        console.error('[ssr] request failed', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Internal server error.');
      }
    }
  };

  return (req, res, next) => {
    handle(req, res, next).catch((error: unknown) => {
      // Only reached when the error path itself fails, for instance when the
      // handler is called with something other than `(req, res, next?)`.
      // Logged, so that it never becomes an unhandled rejection that stops
      // the process.
      console.error('[ssr] request failed, and so did answering it', error);
    });
  };
}
