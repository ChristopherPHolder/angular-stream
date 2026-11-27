import type { Config, Context } from '@netlify/edge-functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import publicPaths from 'virtual:public-paths';
import template from 'virtual:template';
import { config as appConfig } from './app/app.config.server';

/** Netlify Edge Function: the same handler, on Deno. Built by `vp build --mode edge`. */
export default createStreamingHandler<Context>({
  rootComponent: ExamplePage,
  config: appConfig,
  eventDispatchContract,
  allowedHosts: ['localhost', '*.netlify.app'],
  loadTemplate: async () => new Response(template),
});

/**
 * Edge Functions have no `preferStatic`: the build's assets and the files in
 * `public/`, listed at build time by vite.config.ts, are left out by path.
 */
export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*', ...publicPaths],
};
