import { join } from 'node:path';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingLambda } from '@push-based/angular-stream-aws-lambda';
import { config } from './app/app.config.server';

/**
 * The Lambda handler, built into `dist/server/lambda.mjs`: every page request
 * that reaches the Function URL is rendered as a streamed response.
 */
export const handler = createStreamingLambda({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  // The built client sits next to the server bundle in the deployment package.
  templatePath: join(import.meta.dirname, '../client/index.html'),
  allowedHosts: ['localhost', '*.lambda-url.eu-central-1.on.aws'],
});
