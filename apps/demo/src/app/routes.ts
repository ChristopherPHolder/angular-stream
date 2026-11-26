import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Streamed hydration for Angular',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'example',
    title: 'Live example: one page, one slow widget',
    loadComponent: () => import('./example/example').then((m) => m.Example),
  },
  {
    path: 'walkthrough',
    title: 'Streamed hydration, step by step',
    loadComponent: () => import('./walkthrough/walkthrough').then((m) => m.Walkthrough),
  },
  {
    path: 'inspect',
    title: 'Response inspector',
    loadComponent: () => import('./inspector/inspector').then((m) => m.Inspector),
  },
  // Where the example used to live.
  { path: 'simple', redirectTo: 'example' },
  { path: '**', redirectTo: '' },
];
