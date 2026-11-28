import type { Routes } from '@angular/router';
import { NotFound } from './not-found';
import { Page } from './page';

export const routes: Routes = [
  { path: '', component: Page },
  { path: 'teapot', component: Page },
  { path: 'static', component: Page },
  { path: 'csr', component: Page },
  { path: 'old', redirectTo: 'teapot' },
  { path: '**', component: NotFound },
];
