import { DOCUMENT, Location } from '@angular/common';
import { inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ALL_PAGES } from './docs/nav';
import { SITE } from './links';

/** The home page's description, and that of a page that has none of its own. */
const DESCRIPTION =
  'Streamed server-side rendering for Angular: the browser hydrates the page while the response is still arriving.';

/** The home page's name in a link preview; index.html has it as `og:site_name`. */
const SITE_NAME = 'angular-ssr-stream';

/** Shown with a link to any page: the logo on its backdrop, 1200 by 630. */
const PREVIEW_IMAGE = `${SITE}press-kit/social/social-preview.png`;

/**
 * Keeps the document head on the page being shown: its description, what a
 * link to it previews as (`og:*`), and its canonical URL. Prerendering runs
 * this too, which is where it matters: crawlers and chat apps read the HTML,
 * not the hydrated page.
 *
 * Call it in an injection context, once.
 */
export function trackPageHead(): void {
  const meta = inject(Meta);
  const location = inject(Location);
  const head = inject(DOCUMENT).head;

  meta.updateTag({ property: 'og:image', content: PREVIEW_IMAGE });

  inject(Router)
    .events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    )
    .subscribe(() => {
      // `docs/guides/debugging`, or nothing for the home page.
      const path = location.path().replace(/^\//, '').split(/[?#]/)[0];
      const page = ALL_PAGES.find((other) => other.path === path);
      const description = page?.description ?? DESCRIPTION;

      // An unknown path is the not-found page: it has no address of its own to index.
      const known = page !== undefined || path === '';

      meta.updateTag({ name: 'description', content: description });
      // The page's own name; `og:site_name` in index.html says whose page it is.
      // Not `Title.getTitle()`: the router sets the title after this event.
      meta.updateTag({
        property: 'og:title',
        content: page?.title ?? (known ? SITE_NAME : 'Page not found'),
      });
      meta.updateTag({ property: 'og:description', content: description });

      setTag(
        meta,
        'property="og:url"',
        known ? { property: 'og:url', content: SITE + path } : null,
      );
      setTag(meta, 'name="robots"', known ? null : { name: 'robots', content: 'noindex' });
      setCanonical(head, known ? SITE + path : null);
    });
}

function setTag(
  meta: Meta,
  selector: string,
  tag: { name?: string; property?: string; content: string } | null,
): void {
  if (tag === null) {
    meta.removeTag(selector);
  } else {
    meta.updateTag(tag, selector);
  }
}

function setCanonical(head: HTMLHeadElement, url: string | null): void {
  let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (url === null) {
    link?.remove();
    return;
  }
  if (link === null) {
    link = head.ownerDocument.createElement('link');
    link.rel = 'canonical';
    head.appendChild(link);
  }
  link.href = url;
}
