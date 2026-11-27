/**
 * Types for what the AWS Lambda Node.js runtime provides, written out here so
 * the package needs neither the AWS SDK nor `@types/aws-lambda`. They follow
 * the runtime's own source, `aws/aws-lambda-nodejs-runtime-interface-client`
 * (`src/utils/globals.ts`, `src/stream/`).
 */

/**
 * A Lambda Function URL request: the event of payload format version 2.0.
 * Only the fields the adapter reads are listed.
 */
export interface LambdaFunctionUrlEvent {
  version: '2.0';
  /** The path, not decoded: `/movies/1`. */
  rawPath: string;
  /** The query string without its `?`, not decoded; `''` when there is none. */
  rawQueryString: string;
  /** Header names in lower case; repeated headers joined with commas. */
  headers: Record<string, string | undefined>;
  /** The `cookie` header, split on `;`. Present only when the request had cookies. */
  cookies?: string[];
  requestContext: {
    /** The Function URL's own hostname: `<url-id>.lambda-url.<region>.on.aws`. */
    domainName: string;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
  };
  body?: string;
  isBase64Encoded: boolean;
}

/**
 * What a streaming handler gets as its second argument: a writable stream of
 * the response body. In the runtime it's a chunked HTTP request to the Lambda
 * Runtime API; only these members are exposed.
 */
export interface LambdaResponseStream {
  write(chunk: string | Uint8Array, callback?: (error?: Error | null) => void): boolean;
  end(callback?: () => void): this;
  destroy(error?: Error): this;
  on(event: 'drain' | 'close' | 'finish', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'drain' | 'close' | 'finish', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: string, listener: (...args: never[]) => void): this;
  /** Sets the stream's content type. Throws once anything has been written. */
  setContentType(contentType: string): void;
  readonly writableEnded: boolean;
  readonly writableFinished: boolean;
  readonly destroyed: boolean;
}

/**
 * The status, headers and cookies of an HTTP response, sent ahead of its body
 * as a JSON "metadata prelude".
 */
export interface HttpResponseMetadata {
  statusCode?: number;
  headers?: Record<string, string>;
  /** `Set-Cookie` values. A Function URL sends one `Set-Cookie` header per entry. */
  cookies?: string[];
}

/** A handler marked by `awslambda.streamifyResponse()`. */
export type StreamingLambdaHandler<Event = LambdaFunctionUrlEvent> = (
  event: Event,
  responseStream: LambdaResponseStream,
  context: unknown,
) => Promise<void>;

/**
 * The `awslambda` global the Node.js runtime defines before it loads the
 * function's code (unless `AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA` is set).
 */
export interface AwsLambdaGlobal {
  /**
   * Marks `handler` as streaming: the runtime then passes it a response
   * stream instead of waiting for a return value. Returns `handler` itself.
   */
  streamifyResponse<Event>(
    handler: StreamingLambdaHandler<Event>,
    options?: { highWaterMark?: number },
  ): StreamingLambdaHandler<Event>;
  HttpResponseStream: {
    /**
     * Sets the stream's content type to
     * `application/vnd.awslambda.http-integration-response`, and makes its
     * first write send `metadata` as JSON followed by eight null bytes. A
     * Function URL turns that prelude into the response's status and headers.
     */
    from(stream: LambdaResponseStream, metadata: HttpResponseMetadata): LambdaResponseStream;
  };
}

/** The runtime's `awslambda` global, or `undefined` outside Lambda. */
export function awsLambdaGlobal(): AwsLambdaGlobal | undefined {
  return (globalThis as { awslambda?: AwsLambdaGlobal }).awslambda;
}
