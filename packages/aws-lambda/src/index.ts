import { readFile } from 'node:fs/promises';
import {
  type StreamingAppOptions,
  createStreamingHandler,
} from '@push-based/angular-stream-core/server';
import { type StreamingLambdaHandler, awsLambdaGlobal } from './awslambda';
import { toRequest, writeResponse } from './function-url';

export type { StreamingAppOptions } from '@push-based/angular-stream-core/server';
export type {
  AwsLambdaGlobal,
  HttpResponseMetadata,
  LambdaFunctionUrlEvent,
  LambdaResponseStream,
  StreamingLambdaHandler,
} from './awslambda';

export interface StreamingLambdaOptions extends StreamingAppOptions {
  /**
   * The built `index.html`, deployed with the function: a path or a `file:`
   * URL. It's read on the first request and kept for the life of the
   * execution environment.
   */
  templatePath: string | URL;
}

/**
 * A streaming AWS Lambda handler for a Function URL whose invoke mode is
 * `RESPONSE_STREAM`. Export it as the function's handler.
 *
 * Each event is turned into a web `Request` and rendered by the core's
 * `createStreamingHandler()`. The response goes out through
 * `awslambda.HttpResponseStream`: status and headers first, then every chunk
 * as the renderer flushes it.
 *
 * Call it in the module's top level: it needs the `awslambda` global, which
 * only the Lambda Node.js runtime defines.
 */
export function createStreamingLambda({
  templatePath,
  ...options
}: StreamingLambdaOptions): StreamingLambdaHandler {
  const lambda = awsLambdaGlobal();
  if (lambda === undefined) {
    throw new Error(
      'createStreamingLambda() needs the `awslambda` global, which the AWS Lambda Node.js ' +
        'runtime defines. Run it there, without AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA.',
    );
  }

  let template: Promise<string> | undefined;
  const readTemplate = () =>
    (template ??= readFile(templatePath, 'utf8').catch((error: unknown) => {
      // Not kept, so the next request tries again.
      template = undefined;
      throw error;
    }));

  const handle = createStreamingHandler({
    ...options,
    loadTemplate: async () =>
      new Response(await readTemplate(), {
        headers: { 'content-type': 'text/html;charset=utf-8' },
      }),
  });

  return lambda.streamifyResponse(async (event, responseStream) => {
    const request = toRequest(event);
    const response = await handle(request);
    await writeResponse(response, responseStream, lambda, request.method);
  });
}
