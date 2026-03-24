// @vitest-environment node

import { ɵsetAngularAppEngineManifest } from '@angular/ssr';
import { buildServer } from '../server';
import angularAppEngineManifest from '../../dist/angular-stream/server/angular-app-engine-manifest.mjs';

describe('server fragment routing', () => {
  beforeAll(() => {
    ɵsetAngularAppEngineManifest({
      ...angularAppEngineManifest,
      allowedHosts: ['localhost'],
    });
  });

  it('returns fragment HTML for the SSR movie list page route', async () => {
    const app = buildServer();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        if (url.includes('/genre/movie/list')) {
          return new Response(JSON.stringify({ genres: [] }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          });
        }

        if (url.includes('/movie/popular')) {
          return new Response(
            JSON.stringify({
              page: 1,
              results: [
                {
                  adult: false,
                  backdrop_path: '/heist-backdrop.jpg',
                  genre_ids: [28, 35],
                  id: 101,
                  original_language: 'en',
                  original_title: 'The Angular Heist',
                  overview:
                    'A team of frontend engineers pull off a silent migration while a product launch clock is ticking.',
                  popularity: 91.2,
                  poster_path: '/heist-poster.jpg',
                  release_date: '2026-01-10',
                  title: 'The Angular Heist',
                  video: false,
                  vote_average: 8.1,
                  vote_count: 1204,
                },
                {
                  adult: false,
                  backdrop_path: '/signals-backdrop.jpg',
                  genre_ids: [18, 53],
                  id: 102,
                  original_language: 'en',
                  original_title: 'Signals at Dawn',
                  overview:
                    'A refactor of a legacy dashboard turns into a race between reactive state and shipping pressure.',
                  popularity: 84.7,
                  poster_path: '/signals-poster.jpg',
                  release_date: '2025-11-02',
                  title: 'Signals at Dawn',
                  video: false,
                  vote_average: 7.6,
                  vote_count: 944,
                },
              ],
              total_pages: 1,
              total_results: 2,
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            }
          );
        }

        return new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/fragments/movie-list-page/category/popular',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<ct-movies-list');
      expect(response.body).not.toContain('<html');
      expect(response.body).not.toContain('<head>');
      expect(response.body).not.toContain('<body>');
      expect(response.body).toContain('The Angular Heist');
      expect(response.body).toContain('Signals at Dawn');
      expect(response.body).toContain('/detail/movie/101');
      expect(response.body).toContain('/detail/movie/102');
    } finally {
      fetchSpy.mockRestore();
      await app.close();
    }
  });
});
