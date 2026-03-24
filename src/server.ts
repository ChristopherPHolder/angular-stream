import { isMainModule } from '@angular/ssr/node';
import Fastify, { FastifyInstance } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import angularSsr, { createFastifyRequestHandler } from './server/ssr.plugin';
import fragmentsPlugin from './server/fragments/fragments.plugin';

export function buildServer() {
  const app = Fastify({ logger: false });

  app.register(fastifyStatic, {
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../browser'),
    wildcard: false,
  });

  app.get('/health', (req, reply) => {
    return reply.code(200).send('OK');
  });

  app.register(fragmentsPlugin);
  app.register(angularSsr);

  return app;
}

let serverApp: FastifyInstance | undefined;

function getServerApp() {
  serverApp ??= buildServer();
  return serverApp;
}

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  await getServerApp().listen({ port: Number(port), host: '0.0.0.0' });
}

/**
 * Expose request handler for angular dev server
 */
export const reqHandler = createFastifyRequestHandler(getServerApp);
