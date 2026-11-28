import { DOCUMENT, PlatformLocation } from '@angular/common';
import { inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { DEMO, pageAt } from './routes';

/**
 * Puts the page's own description, link preview (`og:*`) and canonical URL in
 * the document head, and keeps an address that has no page out of a search
 * index. The title is the route's, and the router sets it.
 *
 * It runs once, for the path the app starts on: every page load here is a full
 * navigation, so that is the page for good. On the server this is what a
 * crawler and a chat app read; in the browser it finds the same tags and
 * leaves them as they are. The address is the request's own, so nothing here
 * names the host the demo is deployed to.
 *
 * Call it in an injection context.
 */
export function setPageHead(): void {
  const meta = inject(Meta);
  const head = inject(DOCUMENT).head;
  const location = new URL(inject(PlatformLocation).href);
  const page = pageAt(location.pathname);

  if (page === undefined) {
    meta.updateTag({ name: 'robots', content: 'noindex' });
    return;
  }

  // A trailing slash and a query string are the same page: one address for it.
  const url = location.origin + (page.path === '' ? '/' : `/${page.path}`);
  const description = (page.data as { description: string }).description;

  meta.updateTag({ name: 'description', content: description });
  // The page's own name; `og:site_name` in index.html says whose page it is.
  meta.updateTag({ property: 'og:title', content: (page.title as string).replace(DEMO, '') });
  meta.updateTag({ property: 'og:description', content: description });
  meta.updateTag({ property: 'og:url', content: url });

  let canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical === null) {
    canonical = head.ownerDocument.createElement('link');
    canonical.rel = 'canonical';
    head.appendChild(canonical);
  }
  canonical.href = url;
}
