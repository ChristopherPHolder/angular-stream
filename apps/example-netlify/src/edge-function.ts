import type { Config, Context } from '@netlify/edge-functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
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
 * `public/` are left out by name.
 */
export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*', '/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'],
};
