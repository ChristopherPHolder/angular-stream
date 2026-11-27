import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * Cloudflare Worker entry. Renders every page request as a streamed response;
 * see `packages/core` for how.
 */
export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost', 'angular-stream.chris-holder.workers.dev'],
}) satisfies ExportedHandler<Env>;
