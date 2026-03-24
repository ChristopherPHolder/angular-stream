import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { fastifyPlugin } from 'fastify-plugin';
import { AngularNodeAppEngine } from '@angular/ssr/node';

type MovieListPageFragmentParams = {
  type: string;
  identifier: string;
};

const MOVIE_LIST_PAGE_SELECTOR = 'ct-movies-list';

const fragmentsPlugin: FastifyPluginAsync = async (instance) => {
  instance.get<{ Params: MovieListPageFragmentParams }>(
    '/fragments/movie-list-page/:type/:identifier',
    async (request, reply) => {
      const angularApp = new AngularNodeAppEngine({
        allowedHosts: [request.hostname],
      });
      const targetRequest = createMovieListPageRequest(request);
      const response = await angularApp.handle(targetRequest);

      if (!response) {
        return reply.callNotFound();
      }

      if (!response.ok) {
        const body = await response.text();
        const contentType = response.headers.get('content-type');

        if (contentType) {
          reply.type(contentType);
        }

        return reply.code(response.status).send(body);
      }

      const html = await response.text();
      const fragmentHtml = extractHostElementHtml(
        html,
        MOVIE_LIST_PAGE_SELECTOR
      );

      if (!fragmentHtml) {
        request.log.error(
          { targetPath: targetRequest.url },
          'Angular SSR response did not contain the expected movie list page host element.'
        );
        return reply.code(500).send('Internal Server Error');
      }

      return reply.type('text/html; charset=utf-8').send(fragmentHtml);
    }
  );
};

export default fastifyPlugin(fragmentsPlugin, {
  name: 'fragments-plugin',
});

function createMovieListPageRequest(
  request: FastifyRequest<{ Params: MovieListPageFragmentParams }>
): Request {
  const host = request.headers.host ?? 'localhost';
  const protocol = request.protocol || 'http';
  const origin = `${protocol}://${host}`;
  const path = `/list/${encodeURIComponent(request.params.type)}/${encodeURIComponent(request.params.identifier)}`;

  return new Request(new URL(path, origin), {
    headers: toWebHeaders(request.headers),
    method: 'GET',
  });
}

function toWebHeaders(headers: FastifyRequest['headers']): Headers {
  const webHeaders = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      webHeaders.set(name, value);
      continue;
    }

    if (Array.isArray(value)) {
      webHeaders.set(name, value.join(', '));
    }
  }

  return webHeaders;
}

function extractHostElementHtml(html: string, selector: string): string | null {
  const startTag = `<${selector}`;
  const endTag = `</${selector}>`;
  const startIndex = html.indexOf(startTag);

  if (startIndex === -1) {
    return null;
  }

  const endIndex = html.indexOf(endTag, startIndex);

  if (endIndex === -1) {
    return null;
  }

  return html.slice(startIndex, endIndex + endTag.length).trim();
}
