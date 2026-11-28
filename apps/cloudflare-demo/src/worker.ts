import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-ssr-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';
import { PAGE_PATHS, pageAt } from './app/routes';

/** Every page request is rendered as a streamed response. */
const pages = createStreamingWorker({
  rootComponent: App,
  config,
  // withEventReplay() needs Angular's event dispatch contract in the template,
  // and the built index.html the Worker renders into doesn't have it.
  eventDispatchContract,
  allowedHosts: ['localhost', 'angular-ssr-stream-demo.chris-holder.workers.dev'],
});

/**
 * Cloudflare Worker entry. Static assets are served before a request gets
 * here; everything else is a page, or an address that has none.
 *
 * The streaming handler renders whatever the router makes of the URL and
 * answers 200: it has no status codes, since the status is sent with the
 * shell, before the app could set one. The demo knows its pages, so it says
 * what the status is from outside: an address with no page gets the app's
 * not-found page with 404, where it used to get the home page with 200, for
 * any path at all.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    // The example's old address: moved for good, so a crawler drops the old one.
    if (path === '/simple') {
      return Response.redirect(`${url.origin}/example${url.search}`, 301);
    }
    // For crawlers, at whatever address this is deployed to.
    if (path === '/robots.txt') {
      return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
        headers: { 'content-type': 'text/plain;charset=utf-8' },
      });
    }
    if (path === '/sitemap.xml') {
      const urls = PAGE_PATHS.map((page) => `  <url><loc>${url.origin}${page}</loc></url>`);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          urls.join('\n') +
          '\n</urlset>\n',
        { headers: { 'content-type': 'application/xml;charset=utf-8' } },
      );
    }

    const response = await pages.fetch(request, env);
    if (pageAt(url.pathname) !== undefined || !response.ok) {
      return response;
    }
    // The same streamed body, under the status it should have had.
    return new Response(response.body, { status: 404, headers: response.headers });
  },
} satisfies ExportedHandler<Env>;
