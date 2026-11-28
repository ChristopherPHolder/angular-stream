import type { Route, Routes } from '@angular/router';

/** Every title ends with whose page it is: the docs have pages on the same subjects. */
export const DEMO = ' · angular-ssr-stream demo';

/**
 * A page is a route with a `title` and, in `data`, its `description`: what a
 * search result and a link preview say under the title (`page-head.ts`).
 */
export const routes: Routes = [
  {
    path: '',
    title: `Streaming SSR for Angular, shown live${DEMO}`,
    data: {
      description:
        'A live demo of streaming server-side rendering for Angular: one page with one widget that waits for slow data. The widget is streamed into the open response and hydrated when it lands, with each step timed.',
    },
    loadComponent: () => import('./example/example').then((m) => m.Example),
  },
  {
    path: 'walkthrough',
    title: `Streamed hydration, step by step${DEMO}`,
    data: {
      description:
        'One streamed Angular response, labelled as it arrives: which piece each part of the page came in, what it is waiting for, and when Angular hydrates it.',
    },
    loadComponent: () => import('./walkthrough/walkthrough').then((m) => m.Walkthrough),
  },
  {
    path: 'inspect',
    title: `Response inspector${DEMO}`,
    data: {
      description:
        'Fetches a streamed Angular page and splits the response at the boundaries the server writes: every flush, with the time it arrived.',
    },
    loadComponent: () => import('./inspector/inspector').then((m) => m.Inspector),
  },
  // Where the example used to live. The Worker answers both with a 301 before
  // the app is asked; this is for a build that runs without it.
  { path: 'example', redirectTo: '' },
  { path: 'simple', redirectTo: '' },
  {
    path: '**',
    title: `Page not found${DEMO}`,
    loadComponent: () => import('./not-found').then((m) => m.NotFound),
  },
];

/**
 * The page at a pathname, or nothing for an address that has none. The Worker
 * asks, to answer 404, and so does the app, to keep such an address out of a
 * search index. A trailing slash is the same page, as it is to the router.
 */
export function pageAt(pathname: string): Route | undefined {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  return routes.find(
    (route) => route.path === path && route.path !== '**' && route.redirectTo === undefined,
  );
}

/** The pathname of every page, for the sitemap. */
export const PAGE_PATHS: string[] = routes
  .filter((route) => pageAt(`/${route.path}`) === route)
  .map((route) => `/${route.path}`);
