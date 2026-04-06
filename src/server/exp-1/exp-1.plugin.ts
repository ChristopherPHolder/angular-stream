import type { FastifyPluginAsync } from 'fastify';

import { fastifyPlugin } from 'fastify-plugin';

import 'zone.js';

const angularSsrPlugin: FastifyPluginAsync = async (instance) => {
  const render = await import('./render').then((m) => m.render);
  instance.get('/*', async (req, reply) => {


    console.log('WOLOLO ---> ', req.url, req.originalUrl, req.host, req.hostname);

    req.log.info('reply in progress')
    // TODO derive from req
    const content = await render('https://localhost:4000/');

    return reply.type('text/html').code(200).send(content);
  });
};

export default fastifyPlugin(angularSsrPlugin, {
  name: 'exp-1-ssr',
});
