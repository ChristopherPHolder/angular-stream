import type { FastifyPluginAsync } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import {
  FragmentRenderNotFoundError,
  renderMovieCardFragment,
} from './render-movie-card-fragment';

type MovieCardFragmentParams = {
  id: string;
};

const fragmentsPlugin: FastifyPluginAsync = async (instance) => {
  instance.get<{ Params: MovieCardFragmentParams }>(
    '/fragments/movie-card/:id',
    async (request, reply) => {
      try {
        const html = await renderMovieCardFragment(request.params.id);

        return reply.type('text/html; charset=utf-8').send(html);
      } catch (error) {
        if (error instanceof FragmentRenderNotFoundError) {
          return reply.code(404).send('Not Found');
        }

        request.log.error(error);
        return reply.code(500).send('Internal Server Error');
      }
    }
  );
};

export default fastifyPlugin(fragmentsPlugin, {
  name: 'fragments-plugin',
});
