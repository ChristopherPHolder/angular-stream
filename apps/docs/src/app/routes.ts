import type { Routes } from '@angular/router';
import { docResolver } from './docs/doc.resolver';
import { findPage } from './docs/nav';
import { Home } from './home';
import { NotFound } from './not-found';

export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full', title: 'angular-stream' },
  {
    path: 'docs/:dir/:page',
    loadComponent: () => import('./docs/doc-page').then((m) => m.DocPage),
    resolve: { doc: docResolver },
    title: (route) =>
      `${findPage(route.params['dir'], route.params['page'])?.title ?? 'Page not found'} · angular-stream`,
  },
  { path: 'docs', redirectTo: 'docs/getting-started/introduction', pathMatch: 'full' },
  { path: '**', component: NotFound, title: 'Page not found · angular-stream' },
];
