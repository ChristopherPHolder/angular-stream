import { createStreamingWorker } from '@angular-stream/streaming/server';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * Cloudflare Worker entry. Renders every page request as a streamed response;
 * see `packages/streaming` for how.
 */
export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost', 'angular-stream.chris-holder.workers.dev'],
}) satisfies ExportedHandler<Env>;
