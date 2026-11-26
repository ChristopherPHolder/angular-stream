import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Streamed hydration, step by step',
    loadComponent: () => import('./walkthrough/walkthrough').then((m) => m.Walkthrough),
  },
  {
    path: 'inspect',
    title: 'Response inspector',
    loadComponent: () => import('./inspector/inspector').then((m) => m.Inspector),
  },
  { path: '**', redirectTo: '' },
];
