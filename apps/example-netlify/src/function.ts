import type { Config, Context } from '@netlify/functions';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-ssr-stream-core/server';
import template from 'virtual:template';
import { config as appConfig } from './app/app.config.server';

/** Netlify Function: every page request is rendered as a streamed response. */
export default createStreamingHandler<Context>({
  rootComponent: ExamplePage,
  config: appConfig,
  eventDispatchContract,
  allowedHosts: ['localhost', '*.netlify.app'],
  // The built index.html, bundled into the function by vite.config.ts.
  loadTemplate: async () => new Response(template),
});

/**
 * Every path, unless a file in the publish directory matches it. A missing
 * file under `/assets/` is a 404, not a page.
 */
export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*'],
  preferStatic: true,
};
