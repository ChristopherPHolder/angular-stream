import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyPluginAsync } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import { renderStreamingAngular } from './streaming/streaming-angular-renderer';

const angularSsrPlugin: FastifyPluginAsync = async (instance) => {
  const documentPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'index.server.html'
  );
  const document = await readFile(documentPath, 'utf8');

  instance.get('/*', async (request, reply) => {
    try {
      const url = new URL(request.url, `${request.protocol}://${request.host}`);
      const response = await renderStreamingAngular({
        document,
        url: url.href,
        requestId: request.id,
      });

      return reply.send(response);
    } catch (error) {
      request.log.error(error);
      return reply.code(500).type('text/plain').send('Internal Server Error');
    }
  });
};

export default fastifyPlugin(angularSsrPlugin, {
  name: 'angular-ssr-plugin',
});

// Legacy implementation retained for reference.
// import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
// import {
//   AngularNodeAppEngine,
//   createNodeRequestHandler,
//   writeResponseToNodeResponse,
// } from '@angular/ssr/node';
//
// import { fastifyPlugin } from 'fastify-plugin';
//
// const angularSsrPlugin: FastifyPluginAsync = async (instance) => {
//   const angularApp = new AngularNodeAppEngine();
//
//   instance.get('/*', async (request, reply) => {
//     try {
//       const response = await angularApp.handle(request.raw);
//
//       if (response) {
//         return writeResponseToNodeResponse(response, reply.raw);
//       }
//
//       return reply.code(404).send('Not Found');
//     } catch (error) {
//       request.log.error(error);
//       return reply.code(500).send('Internal Server Error');
//     }
//   });
// };
//
// export default fastifyPlugin(angularSsrPlugin, {
//   name: 'angular-ssr-plugin',
// });
//
// export function createFastifyRequestHandler(instance: FastifyInstance) {
//   return createNodeRequestHandler(async (req, res) => {
//     await instance.ready();
//     instance.server.emit('request', req, res);
//   });
// }
