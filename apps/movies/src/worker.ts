import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-ssr-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * Cloudflare Worker entry. Renders every page request as a streamed response;
 * see `packages/core` for how.
 */
export default createStreamingWorker({
  rootComponent: App,
  config,
  // withEventReplay() needs Angular's event dispatch contract in the template,
  // and the built index.html the Worker renders into doesn't have it.
  eventDispatchContract,
  allowedHosts: ['localhost', 'angular-ssr-stream-movies.chris-holder.workers.dev'],
}) satisfies ExportedHandler<Env>;
