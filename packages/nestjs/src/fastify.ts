import { createFastifyHandler } from '@push-based/angular-ssr-stream-fastify';
import { createStaticHandler } from '@push-based/angular-ssr-stream-node';
// Types only: the Fastify instance is the app's, from @nestjs/platform-fastify.
import type { FastifyInstance } from 'fastify';
import { toNestError } from './errors';
import type { AngularStreamModuleOptions } from './options';
import { isUnderPrefix } from './prefix';

/**
 * Adds the render route to a Nest app on `@nestjs/platform-fastify`: `GET` and
 * `HEAD` on `/*`, which Fastify only picks when no more specific route, a
 * controller's among them, matches the URL.
 *
 * The route is added from a plugin, which Fastify loads when the app starts,
 * after every plugin registered before `app.init()`: `@fastify/compress`
 * applies to it however it was registered. The plugin skips encapsulation, as
 * `fastify-plugin` does, so the route has Nest's own 404 and error handlers.
 */
export function addFastifyRenderer(
  fastify: FastifyInstance,
  options: AngularStreamModuleOptions,
  prefix: string | null,
): void {
  const { staticDir, ...handlerOptions } = options;
  const render = createFastifyHandler(handlerOptions);
  const serveStatic = staticDir === undefined ? null : createStaticHandler(staticDir);

  const plugin = async (instance: FastifyInstance): Promise<void> => {
    instance.route({
      method: ['GET', 'HEAD'],
      url: '/*',
      async handler(request, reply) {
        const target = request.url;
        // Under the global prefix, a request no controller took is Nest's 404.
        if (prefix !== null && isUnderPrefix(target, prefix)) {
          return reply.callNotFound();
        }
        // A file is written to the socket by the Node adapter's static
        // handler, so the reply is Fastify's no more: `onSend` hooks don't
        // run for it, and neither does `@fastify/compress`.
        if (serveStatic !== null && (await serveStatic(request.raw, reply.raw))) {
          return reply.hijack();
        }
        // Vite's hashed build output. A file that isn't there, such as an old
        // chunk after a deploy, is a 404 rather than a page.
        if (isUnderPrefix(target, '/assets')) {
          return reply.callNotFound();
        }
        try {
          return await render(request, reply);
        } catch (error) {
          throw toNestError(error);
        }
      },
    });
  };

  Object.assign(plugin, {
    [Symbol.for('skip-override')]: true,
    [Symbol.for('fastify.display-name')]: '@push-based/angular-ssr-stream-nestjs',
  });
  void fastify.register(plugin);
}
