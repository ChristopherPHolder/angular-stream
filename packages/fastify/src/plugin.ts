import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import {
  type StreamingAppOptions,
  createStreamingHandler,
} from '@push-based/angular-stream-core/server';
import { createTemplateLoader, toWebRequest } from '@push-based/angular-stream-node';
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteShorthandOptions,
} from 'fastify';

export interface FastifyHandlerOptions extends StreamingAppOptions {
  /**
   * The built template every page is rendered into, as a path or a `file:`
   * URL: with ngp's `ssr` option, `dist/server/index.server.html`. Read from
   * disk on the first request, then kept in memory.
   */
  template: string | URL;
  /**
   * Take the protocol and host from `X-Forwarded-Proto` and `X-Forwarded-Host`.
   * Turn this on only behind a proxy that sets them. Fastify's own
   * `trustProxy` server option doesn't change the URL a page is rendered for.
   * Default: `false`.
   */
  trustProxy?: boolean;
}

/**
 * A Fastify route handler that renders the request's URL as a page and sends
 * it through the reply.
 */
export type FastifyHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<FastifyReply>;

export interface AngularStreamOptions extends FastifyHandlerOptions {
  /**
   * Options for the page route, as `fastify.get(path, options, handler)`
   * takes them: `{ compress: false }` to leave pages out of
   * `@fastify/compress`, a `handlerTimeout`, a `logLevel`, hooks.
   */
  route?: RouteShorthandOptions;
}

/**
 * The page route's handler, for a route of your own: it renders the request's
 * URL into the template and streams the page through `reply.send()`, so
 * `onSend` hooks (`@fastify/compress` among them) still apply. The
 * `angularStream` plugin is this handler on `GET` and `HEAD` `/*`.
 *
 * A `Host` that is more than a host and a port rejects with a
 * `BadRequestError`, which Fastify answers with `400`. When the client goes
 * away mid-render, Fastify destroys the body, and that stops the render.
 */
export function createFastifyHandler(options: FastifyHandlerOptions): FastifyHandler {
  const { template, trustProxy, ...app } = options;
  const render = createStreamingHandler<IncomingMessage>({
    ...app,
    // In `vite dev`, it takes the dev server's template from the raw request.
    loadTemplate: createTemplateLoader(template),
  });

  return async (request, reply) => {
    const response = await render(
      toWebRequest(request.raw, reply.raw, { trustProxy }),
      request.raw,
    );
    return sendResponse(reply, response);
  };
}

/**
 * A Fastify plugin that renders the application: a `GET` and `HEAD` route on
 * `/*`, under the prefix it is registered with, with the handler
 * `createFastifyHandler()` returns.
 *
 * Register what answers other `GET`s first or after, as Fastify matches the
 * most specific route: an API, and the browser build with `@fastify/static`
 * (`wildcard: false`, since a wildcard route of its own would take `/*`).
 */
export const angularStream: FastifyPluginAsync<AngularStreamOptions> = async (fastify, options) => {
  const { route, ...handlerOptions } = options;

  fastify.route({
    ...route,
    method: ['GET', 'HEAD'],
    url: '/*',
    handler: createFastifyHandler(handlerOptions),
  });
};

Object.assign(angularStream, {
  // What Fastify names the plugin in its errors and in `printPlugins()`.
  [Symbol.for('plugin-meta')]: { name: '@push-based/angular-stream-fastify', fastify: '5.x' },
});

/**
 * Hands a web `Response` to Fastify: its status and headers on the reply, and
 * its body as a Node stream, which Fastify pipes to the socket a chunk at a
 * time, after the `onSend` hooks (`@fastify/compress` among them) have had it.
 */
function sendResponse(reply: FastifyReply, response: Response): FastifyReply {
  reply.code(response.status);
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') {
      reply.header(name, value);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    reply.header('set-cookie', cookies);
  }

  const body = response.body;
  if (body === null || reply.request.method === 'HEAD') {
    // Cancelling stops the render: a `HEAD` gets the headers only.
    void body?.cancel().catch(() => undefined);
    return reply.send();
  }

  // Nginx buffers proxied responses unless told not to, which would hold the
  // shell back until the last chunk. Other proxies ignore it.
  if (!response.headers.has('x-accel-buffering')) {
    reply.header('x-accel-buffering', 'no');
  }
  return reply.send(Readable.fromWeb(body as NodeReadableStream<Uint8Array>));
}
