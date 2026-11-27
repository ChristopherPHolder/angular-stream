import type { ServerResponse } from 'node:http';
import {
  type StreamingAppOptions,
  createStreamingHandler,
} from '@push-based/angular-stream-core/server';
import { type NodeRequest, toWebRequest } from './request';
import { sendWebResponse } from './response';
import { createStaticHandler } from './static';
import { DEV_TEMPLATE, createTemplateLoader } from './template';

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
 * middleware.
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
 * When the client goes away mid-render, the render stops. An error is passed
 * to `next` when there is one; otherwise the handler answers 500, or cuts the
 * connection when the response has already started.
 */
export function createNodeHandler(options: NodeHandlerOptions): NodeHandler {
  const { template, staticDir, trustProxy, ...app } = options;
  const loadTemplate = createTemplateLoader(template);
  const serveStatic = staticDir === undefined ? null : createStaticHandler(staticDir);
  const render = createStreamingHandler<NodeRequest>({
    ...app,
    loadTemplate: (_request, req) => {
      // In `vite dev`, the plugin from `/vite` hands over the dev server's template.
      const devTemplate = (req as NodeRequest & { [DEV_TEMPLATE]?: string })[DEV_TEMPLATE];
      return devTemplate === undefined
        ? loadTemplate()
        : Promise.resolve(
            new Response(devTemplate, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
          );
    },
  });

  const handle = async (
    req: NodeRequest,
    res: ServerResponse,
    next?: (error?: unknown) => void,
  ): Promise<void> => {
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
      console.error('[ssr] request failed', error);
      if (res.headersSent) {
        res.destroy();
      } else {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Internal server error.');
      }
    }
  };

  return (req, res, next) => {
    void handle(req, res, next);
  };
}
