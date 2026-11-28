import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { defineStreamingHandler } from '@push-based/angular-ssr-stream-nitro';
import { config } from './app/app.config.server';

export default defineStreamingHandler({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
});
