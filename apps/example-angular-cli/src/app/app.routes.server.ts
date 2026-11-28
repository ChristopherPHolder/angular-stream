import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rendered per request, so it can stream. A prerendered route is a file
  // written at build time: there is nothing left to stream.
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
