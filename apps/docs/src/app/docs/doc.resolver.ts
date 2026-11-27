import { inject } from '@angular/core';
import { RedirectCommand, type ResolveFn, Router } from '@angular/router';
import { ALL_PAGES, type FlatDocPage, type TocEntry, findPage } from './nav';

export interface ResolvedDoc {
  page: FlatDocPage;
  html: string;
  toc: TocEntry[];
  previous: FlatDocPage | undefined;
  next: FlatDocPage | undefined;
}

/** Loads the page's prerendered Markdown; an unknown page is the not-found page. */
export const docResolver: ResolveFn<ResolvedDoc> = async (route) => {
  const page = findPage(route.params['section'], route.params['page']);
  if (page === undefined) {
    return new RedirectCommand(inject(Router).parseUrl('/404'), { skipLocationChange: true });
  }
  const { default: content } = await page.load();
  const index = ALL_PAGES.indexOf(page);
  return {
    page,
    html: content.html,
    toc: content.toc,
    previous: ALL_PAGES[index - 1],
    next: ALL_PAGES[index + 1],
  };
};
