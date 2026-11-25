import { ɵisHostAllowed } from '@angular/platform-server';
import render, { ALLOWED_HOSTS } from './main.server';
import { renderStreamingAngular } from './server/streaming/streaming-angular-renderer';

const allowedHosts = new Set<string>(ALLOWED_HOSTS);

/**
 * Cloudflare Worker entry.
 *
 * Static assets are served by the asset worker before a request reaches here,
 * so everything that arrives is a page request: fetch the built `index.html`
 * through the ASSETS binding and render the route into it.
 *
 * In `vite dev` the binding is backed by the Vite dev server, so the template
 * already carries Vite's dev transforms.
 *
 * Rendering is streamed. The shell goes out while TMDB is still in flight,
 * each boundary follows as it resolves, and Angular's authoritative
 * hydration-annotated document lands last. If the streaming renderer throws
 * *before* its first flush, nothing is committed yet and we can still fall
 * back to a buffered render with a real status code.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The streaming path drives the platform directly, so it does not get
    // `renderApplication`'s host guard for free. Apply it up front, once.
    if (!ɵisHostAllowed(url.hostname, allowedHosts)) {
      return new Response('Forbidden.', { status: 403 });
    }

    const template = await env.ASSETS.fetch(new URL('/index.html', request.url));

    if (!template.ok) {
      return new Response('Not found.', { status: 404 });
    }

    const document = await template.text();

    try {
      return await renderStreamingAngular({ document, url: request.url });
    } catch (error) {
      console.error('[ssr] streaming render failed before commit, falling back', error);
      const html = await render(request.url, document);

      return new Response(html, {
        headers: { 'content-type': 'text/html;charset=utf-8' },
      });
    }
  },
} satisfies ExportedHandler<Env>;
