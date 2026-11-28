import type { Routes } from '@angular/router';
import { docResolver } from './docs/doc.resolver';
import { findPage, headlineOf } from './docs/nav';
import { HOME_TITLE } from './page-head';
import { Home } from './home';
import { NotFound } from './not-found';

export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full', title: HOME_TITLE },
  {
    path: 'docs/:dir/:page',
    loadComponent: () => import('./docs/doc-page').then((m) => m.DocPage),
    resolve: { doc: docResolver },
    title: (route) => {
      const page = findPage(route.params['dir'], route.params['page']);
      return `${page ? headlineOf(page) : 'Page not found'} · angular-ssr-stream`;
    },
  },
  { path: 'docs', redirectTo: 'docs/getting-started/introduction', pathMatch: 'full' },
  { path: '**', component: NotFound, title: 'Page not found · angular-ssr-stream' },
];
