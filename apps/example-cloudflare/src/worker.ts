import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { config } from './app/app.config.server';

/** Cloudflare Worker entry: every page request is rendered as a streamed response. */
export default createStreamingWorker({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
}) satisfies ExportedHandler<Env>;
