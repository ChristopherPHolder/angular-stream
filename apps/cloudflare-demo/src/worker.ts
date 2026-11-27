import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

/** Cloudflare Worker entry: every page request is rendered as a streamed response. */
export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost', 'angular-stream-demo.chris-holder.workers.dev'],
}) satisfies ExportedHandler<Env>;
