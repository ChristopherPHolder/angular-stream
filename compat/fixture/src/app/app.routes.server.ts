import { RenderMode, type ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'teapot', renderMode: RenderMode.Server, status: 418, headers: { 'X-Route': 'teapot' } },
  { path: 'static', renderMode: RenderMode.Prerender },
  { path: 'csr', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
