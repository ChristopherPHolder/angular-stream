// @vitest-environment node

import { ɵsetAngularAppEngineManifest } from '@angular/ssr';
import { buildServer } from '../server';
import angularAppEngineManifest from '../../dist/angular-stream/server/angular-app-engine-manifest.mjs';

describe('server SSR catch-all routing', () => {
  beforeAll(() => {
    ɵsetAngularAppEngineManifest({
      ...angularAppEngineManifest,
      allowedHosts: ['localhost'],
    });
  });

  it('continues to serve normal SSR routes after fragments are registered', async () => {
    const requestedUrls: string[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        requestedUrls.push(url);

        if (url.includes('/genre/movie/list')) {
          return new Response(JSON.stringify({ genres: [] }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          });
        }

        return new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      });

    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/page-not-found',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('Sorry, page not found');
      expect(fetchSpy).toHaveBeenCalled();
      expect(
        requestedUrls.some((url) => url.includes('/genre/movie/list'))
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      await app.close();
    }
  });
});
