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

  it('returns fragment HTML for a known movie card id', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/fragments/movie-card/1',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<exp-fragment-movie-card');
      expect(response.body).not.toContain('<html');
      expect(response.body).not.toContain('<head>');
      expect(response.body).not.toContain('<body>');
    } finally {
      await app.close();
    }
  });

  it('returns 404 for an unknown fragment id', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/fragments/movie-card/does-not-exist',
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('Not Found');
    } finally {
      await app.close();
    }
  });
});
