```bash
npm install @push-based/angular-ssr-stream-aws-lambda@next
```

The AWS Lambda adapter. It depends on
[`@push-based/angular-ssr-stream-core`](core.md), whose browser providers the app
still needs. It needs neither the AWS SDK nor `@types/aws-lambda`. For the
whole setup, see [AWS Lambda](../getting-started/aws-lambda.md).

## `createStreamingLambda()`

```ts
function createStreamingLambda(options: StreamingLambdaOptions): StreamingLambdaHandler;

interface StreamingLambdaOptions extends StreamingAppOptions {
  /** The built index.html, deployed with the function: a path or a file: URL. */
  templatePath: string | URL;
}

interface StreamingAppOptions {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /** The application's server config, provideServerRendering() included. */
  config: ApplicationConfig;
  /** Every hostname the function answers for. */
  allowedHosts: readonly string[];
  /** The contents of @angular/core/event-dispatch-contract.min.js, for withEventReplay(). */
  eventDispatchContract?: string;
}
```

A streaming handler for a Function URL whose invoke mode is `RESPONSE_STREAM`:
the core's [`createStreamingHandler()`](core.md#createstreaminghandler),
wrapped in `awslambda.streamifyResponse()`. Export it as the function's
handler:

```ts title="src/lambda.ts"
import { join } from 'node:path';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';

export const handler = createStreamingLambda({
  rootComponent: App,
  config,
  eventDispatchContract,
  templatePath: join(import.meta.dirname, '../client/index.html'),
  allowedHosts: ['localhost', `*.lambda-url.${process.env['AWS_REGION']}.on.aws`],
});
```

Call it at the module's top level. It reads the `awslambda` global, which the
Lambda Node.js runtime defines before it loads the handler, and throws when the
global is missing. That happens outside Lambda, or with
`AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA` set.

For each event, the handler:

1. Builds a web `Request`. The URL is the `host` header (the Function URL's
   hostname, also behind CloudFront), plus `rawPath` and `rawQueryString`.
   The headers are the event's, with `cookies` joined back into a `cookie`
   header. The body is decoded from base64 when `isBase64Encoded` is set.
2. Renders it with the core handler. The template is read from `templatePath`
   on the first request and kept for the life of the execution environment. A
   failed read is retried on the next request.
3. Writes the `Response` with `awslambda.HttpResponseStream.from()`. The
   status code and headers go in the metadata prelude, and `Set-Cookie`
   headers go in its `cookies`. The prelude is sent straight away. Each body
   chunk is written as the renderer flushes it, waiting for `drain` when the
   stream is full. The handler resolves once the stream has finished.

If the render fails after the first chunk, the handler rejects. The runtime
then ends the stream with error trailers, so the client gets a cut-off page.
Before the first chunk, the core falls back to a buffered render as usual.

If the response stream closes before the response is written, which happens
when the runtime's connection to the Lambda Runtime API drops, the handler
stops the render and rejects, so the invocation fails instead of running until
it times out.

A client that disconnects doesn't close the response stream. AWS: "streamed
responses are not interrupted or stopped when the invoking client connection
is broken"
([response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)).
The function isn't told, so the `Request` has no abort signal: the render runs
to the end, and the whole invocation is billed.

## `StreamingLambdaHandler`

```ts
type StreamingLambdaHandler<Event = LambdaFunctionUrlEvent> = (
  event: Event,
  responseStream: LambdaResponseStream,
  context: unknown,
) => Promise<void>;
```

A handler marked by `awslambda.streamifyResponse()`. The runtime passes it a
response stream instead of waiting for a return value.

## `LambdaFunctionUrlEvent`

```ts
interface LambdaFunctionUrlEvent {
  version: '2.0';
  rawPath: string;
  rawQueryString: string;
  headers: Record<string, string | undefined>;
  cookies?: string[];
  requestContext: {
    domainName: string;
    http: { method: string; path: string; protocol: string; sourceIp: string; userAgent: string };
  };
  body?: string;
  isBase64Encoded: boolean;
}
```

The part of a Function URL request (payload format 2.0) that the adapter
reads. API Gateway REST APIs send a different event (payload 1.0), which the
adapter does not handle.

## `AwsLambdaGlobal`

```ts
interface AwsLambdaGlobal {
  streamifyResponse<Event>(
    handler: StreamingLambdaHandler<Event>,
    options?: { highWaterMark?: number },
  ): StreamingLambdaHandler<Event>;
  HttpResponseStream: {
    from(stream: LambdaResponseStream, metadata: HttpResponseMetadata): LambdaResponseStream;
  };
}

interface HttpResponseMetadata {
  statusCode?: number;
  headers?: Record<string, string>;
  cookies?: string[];
}
```

The `awslambda` global, typed from the runtime's source
([aws-lambda-nodejs-runtime-interface-client](https://github.com/aws/aws-lambda-nodejs-runtime-interface-client)).
The package reads it from `globalThis` and declares no global type, so it
leaves the app's own globals alone.

`HttpResponseStream.from()` sets the stream's content type to
`application/vnd.awslambda.http-integration-response`. The stream's first
write then sends `metadata` as JSON, followed by eight null bytes. The
Function URL turns that prelude into the response's status line and headers.

## `LambdaResponseStream`

```ts
interface LambdaResponseStream {
  write(chunk: string | Uint8Array, callback?: (error?: Error | null) => void): boolean;
  end(callback?: () => void): this;
  destroy(error?: Error): this;
  on(event: 'drain' | 'close' | 'finish', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'drain' | 'close' | 'finish', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: string, listener: (...args: never[]) => void): this;
  setContentType(contentType: string): void;
  readonly writableEnded: boolean;
  readonly writableFinished: boolean;
  readonly destroyed: boolean;
}
```

The response stream the runtime passes to a streaming handler. It's the
writable side of a chunked HTTP request to the Lambda Runtime API, and only
these members are exposed. `setContentType()` throws once anything has been
written.
