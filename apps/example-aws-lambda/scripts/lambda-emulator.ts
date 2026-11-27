/**
 * A local stand-in for what AWS runs around a response-streaming function
 * behind a Function URL, for checking that the built handler streams. SAM
 * local and the Runtime Interface Emulator buffer streamed responses, so they
 * can't show it.
 *
 * Three parts, each following AWS's own code or documentation:
 *
 * - The `awslambda` global and the response stream, as the Node.js runtime
 *   defines them: aws/aws-lambda-nodejs-runtime-interface-client,
 *   `src/utils/globals.ts`, `src/stream/response-stream.ts`,
 *   `src/stream/http-response-stream.ts` and
 *   `src/runtime/streaming-invoke-processor.ts`. As there, the response
 *   stream is a chunked HTTP POST to a Runtime API, which this file also
 *   runs, and `HttpResponseStream.from()` makes the first write send the
 *   metadata prelude: JSON, then eight null bytes.
 * - The Function URL: turns an HTTP request into a payload 2.0 event, reads
 *   the prelude off the invocation's response stream for the status, headers
 *   and cookies, and forwards the rest of the body as it arrives.
 * - S3 behind CloudFront, for the static files: the same path patterns as
 *   template.yaml's cache behaviors, served from `dist/client`.
 *
 * What it doesn't model: separate execution environments (concurrent
 * requests share one process and its module state), timeouts, the 2 MB/s cap
 * after the first 6 MB, and whatever AWS's own network does between the
 * Function URL and the client.
 *
 * Where it differs: when the handler fails before it writes anything, there
 * is no prelude, so this Function URL has no status to send and destroys the
 * client's socket. A real Function URL probably answers 502; AWS doesn't
 * document it.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import {
  Agent,
  type ClientRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
  request as httpRequest,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';

const HANDLER_STREAMING = Symbol.for('aws.lambda.runtime.handler.streaming');
const HANDLER_HIGHWATERMARK = Symbol.for('aws.lambda.runtime.handler.streaming.highWaterMark');
const STREAM_RESPONSE = 'response';

const METADATA_PRELUDE_CONTENT_TYPE = 'application/vnd.awslambda.http-integration-response';
const DELIMITER_LEN = 8;
const TRAILER_NAME_ERROR_TYPE = 'Lambda-Runtime-Function-Error-Type';
const TRAILER_NAME_ERROR_BODY = 'Lambda-Runtime-Function-Error-Body';

export type Handler = ((event: unknown, responseStream: unknown, context: unknown) => unknown) & {
  [HANDLER_STREAMING]?: string;
  [HANDLER_HIGHWATERMARK]?: number;
};

/** The runtime's response stream: a `ClientRequest` with two additions. */
interface ResponseStream extends ClientRequest {
  setContentType(contentType: string): void;
  _onBeforeFirstWrite?: (write: (chunk: string | Uint8Array) => void) => void;
}

// ---------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------

/** Defines `globalThis.awslambda` as the runtime does before it loads the handler. */
export function installAwsLambdaGlobal(): void {
  (globalThis as Record<string, unknown>)['awslambda'] = {
    streamifyResponse(handler: Handler, options?: { highWaterMark?: number }) {
      handler[HANDLER_STREAMING] = STREAM_RESPONSE;
      if (typeof options?.highWaterMark === 'number') {
        handler[HANDLER_HIGHWATERMARK] = Number.parseInt(String(options.highWaterMark));
      }
      return handler;
    },
    HttpResponseStream: {
      from(underlyingStream: ResponseStream, prelude: Record<string, unknown>) {
        underlyingStream.setContentType(METADATA_PRELUDE_CONTENT_TYPE);
        const metadataPrelude = JSON.stringify(prelude);
        underlyingStream._onBeforeFirstWrite = (write) => {
          write(metadataPrelude);
          write(new Uint8Array(DELIMITER_LEN));
        };
        return underlyingStream;
      },
    },
  };
}

const WRITABLE_METHODS = [
  'cork',
  'destroy',
  'end',
  'uncork',
  'write',
  'addListener',
  'on',
  'once',
  'prependListener',
  'prependOnceListener',
  'off',
  'removeListener',
  'removeAllListeners',
  'setMaxListeners',
  'getMaxListeners',
  'listeners',
  'rawListeners',
  'listenerCount',
  'eventNames',
  'emit',
  'setContentType',
] as const;
const PROPS_READ_WRITE = ['destroyed', '_onBeforeFirstWrite'] as const;
const PROPS_READ_ONLY = [
  'writableFinished',
  'writableObjectMode',
  'writableEnded',
  'writableNeedDrain',
  'writableHighWaterMark',
  'writableCorked',
  'writableLength',
  'writable',
] as const;

/**
 * The response stream for one invocation: a chunked POST to the Runtime API,
 * of which the handler sees only the members the runtime exposes.
 */
function createResponseStream(runtimeApi: AddressInfo, requestId: string) {
  // The runtime keeps one connection (`maxSockets: 1`) for its one invocation
  // at a time. Concurrent requests here stand for separate execution
  // environments, so each gets its own.
  const agent = new Agent({ keepAlive: false, maxSockets: 1 });
  let status: 'ready' | 'write_called' = 'ready';
  let resolveDone!: () => void;
  let rejectDone!: (error: unknown) => void;
  const responseDone = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const req = httpRequest(
    {
      hostname: runtimeApi.address,
      port: runtimeApi.port,
      method: 'POST',
      path: `/2018-06-01/runtime/invocation/${encodeURIComponent(requestId)}/response`,
      headers: {
        'Lambda-Runtime-Function-Response-Mode': 'streaming',
        Trailer: [TRAILER_NAME_ERROR_TYPE, TRAILER_NAME_ERROR_BODY],
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked',
      },
      agent,
    },
    (res) => {
      res.resume();
      res.on('end', () => {
        agent.destroy();
        resolveDone();
      });
      res.on('aborted', rejectDone);
    },
  ) as ResponseStream;
  req.on('error', (error) => {
    rejectDone(error);
    req.destroy(error);
  });

  req.setContentType = (contentType) => {
    if (status !== 'ready') {
      throw new Error('Cannot set content-type, too late.');
    }
    req.setHeader('Content-Type', contentType);
  };

  const origWrite = req.write.bind(req) as (...args: unknown[]) => boolean;
  req.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
    let data = chunk;
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) {
      data = JSON.stringify(chunk);
    }
    if (status === 'ready' && typeof req._onBeforeFirstWrite === 'function') {
      req._onBeforeFirstWrite((ch) => origWrite(ch));
    }
    const ret = origWrite(data, encoding, callback);
    status = 'write_called';
    return ret;
  }) as ResponseStream['write'];

  const stream: Record<string, unknown> = {};
  for (const method of WRITABLE_METHODS) {
    stream[method] = (req[method] as (...args: unknown[]) => unknown).bind(req);
  }
  for (const prop of PROPS_READ_WRITE) {
    Object.defineProperty(stream, prop, {
      get: () => req[prop],
      set: (value) => {
        (req as unknown as Record<string, unknown>)[prop] = value;
      },
    });
  }
  for (const prop of PROPS_READ_ONLY) {
    Object.defineProperty(stream, prop, { get: () => req[prop] });
  }

  /** What the runtime does when the handler throws: error trailers, then the end. */
  const fail = (error: unknown) =>
    new Promise<void>((resolve) => {
      const errorType = error instanceof Error ? error.name : 'Error';
      const body = { errorType, errorMessage: String(error) };
      req.addTrailers({
        [TRAILER_NAME_ERROR_TYPE]: errorType,
        [TRAILER_NAME_ERROR_BODY]: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
      req.end(resolve);
    });

  return { responseStream: stream, responseDone, fail };
}

/**
 * Runs one invocation of a streaming handler, which writes its response to
 * the Runtime API at `runtimeApi`.
 */
export type Invoke = (
  handler: Handler,
  event: unknown,
  runtimeApi: AddressInfo,
  requestId: string,
) => Promise<void>;

/** One invocation, as `StreamingInvokeProcessor.processInvoke()` runs it. */
const invoke: Invoke = async (handler, event, runtimeApi, requestId) => {
  const { responseStream, responseDone, fail } = createResponseStream(runtimeApi, requestId);
  const context = {
    awsRequestId: requestId,
    functionName: 'example-aws-lambda',
    getRemainingTimeInMillis: () => 30_000,
  };

  try {
    const result = handler(event, responseStream, context);
    if (typeof (result as Promise<unknown> | undefined)?.then !== 'function') {
      throw new Error('Streaming does not support non-async handlers.');
    }
    await result;
    await responseDone;
    if (!(responseStream['writableFinished'] as boolean)) {
      throw new Error('Response stream is not finished.');
    }
  } catch (error) {
    await new Promise((resolve) => setImmediate(resolve));
    console.error('Invoke Error', error);
    await fail(error);
  }
};

// ---------------------------------------------------------------------------
// The Function URL
// ---------------------------------------------------------------------------

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/;

/** The payload 2.0 event a Function URL sends for `request`. */
async function toEvent(request: IncomingMessage, requestId: string) {
  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/', `http://${host}`);

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && name !== 'cookie') {
      headers[name] = Array.isArray(value) ? value.join(',') : value;
    }
  }
  // The real one is HTTPS only; this one is plain HTTP.
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-for'] = request.socket.remoteAddress ?? '127.0.0.1';

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);
  const isText = TEXT_TYPES.test(request.headers['content-type'] ?? '');
  const now = new Date();

  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    ...(request.headers.cookie ? { cookies: request.headers.cookie.split('; ') } : {}),
    headers,
    ...(url.search
      ? { queryStringParameters: Object.fromEntries(url.searchParams.entries()) }
      : {}),
    requestContext: {
      accountId: 'anonymous',
      apiId: 'local',
      domainName: host,
      domainPrefix: host.split('.')[0],
      http: {
        method: request.method ?? 'GET',
        path: url.pathname,
        protocol: `HTTP/${request.httpVersion}`,
        sourceIp: headers['x-forwarded-for'],
        userAgent: request.headers['user-agent'] ?? '',
      },
      requestId,
      routeKey: '$default',
      stage: '$default',
      time: now.toUTCString(),
      timeEpoch: now.getTime(),
    },
    ...(body.length > 0 ? { body: isText ? body.toString('utf8') : body.toString('base64') } : {}),
    isBase64Encoded: body.length > 0 && !isText,
  };
}

/**
 * Forwards one invocation's response stream (the Runtime API's side of the
 * POST) to the client: the prelude becomes the status and headers, the rest
 * goes out chunk by chunk as it arrives.
 */
function forwardResponse(fromRuntime: IncomingMessage, client: ServerResponse): void {
  const integration = fromRuntime.headers['content-type'] === METADATA_PRELUDE_CONTENT_TYPE;
  let pending: Buffer | undefined = integration ? Buffer.alloc(0) : undefined;

  if (!integration) {
    client.writeHead(200, {
      'content-type': fromRuntime.headers['content-type'] ?? 'application/octet-stream',
    });
  }

  fromRuntime.on('data', (chunk: Buffer) => {
    if (pending === undefined) {
      client.write(chunk);
      return;
    }
    pending = Buffer.concat([pending, chunk]);
    const end = pending.indexOf(Buffer.alloc(DELIMITER_LEN));
    if (end === -1) {
      return;
    }
    const prelude = JSON.parse(pending.subarray(0, end).toString('utf8')) as {
      statusCode?: number;
      headers?: Record<string, string>;
      cookies?: string[];
    };
    const rest = pending.subarray(end + DELIMITER_LEN);
    pending = undefined;

    client.writeHead(prelude.statusCode ?? 200, {
      ...prelude.headers,
      ...(prelude.cookies?.length ? { 'set-cookie': prelude.cookies } : {}),
    });
    // Sends the status line and headers now, not with the first body chunk.
    client.flushHeaders();
    if (rest.length > 0) {
      client.write(rest);
    }
  });

  fromRuntime.on('end', () => {
    if (fromRuntime.trailers[TRAILER_NAME_ERROR_TYPE.toLowerCase()] !== undefined) {
      // The function failed: the client gets a cut-off response, or, before
      // the prelude, a dropped connection (see the note at the top).
      client.destroy();
    } else if (pending !== undefined) {
      client.writeHead(502, { 'content-type': 'text/plain' });
      client.end('The response stream ended before its metadata prelude.');
    } else {
      client.end();
    }
  });
}

// ---------------------------------------------------------------------------
// S3 behind CloudFront
// ---------------------------------------------------------------------------

const STATIC_PATTERNS = [/^\/assets\//, /\.ico$/, /\.svg$/, /\.png$/];
const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serveStatic(staticDir: string, pathname: string, client: ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    client.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request.');
    return;
  }
  const file = normalize(join(staticDir, decoded));
  // With the separator, so `/../client-x/` can't pass as inside `client`.
  const inside = file.startsWith(join(staticDir, sep));
  if (!inside || !existsSync(file) || !statSync(file).isFile()) {
    client.writeHead(404, { 'content-type': 'text/plain' }).end('Not found.');
    return;
  }
  client.writeHead(200, {
    'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(client);
}

// ---------------------------------------------------------------------------

export interface FunctionUrlOptions {
  /** The handler module's export, after `installAwsLambdaGlobal()`. */
  handler: unknown;
  /** Where the built client is: the S3 bucket's contents. */
  staticDir: string;
  port: number;
  /** Defaults to this file's copy of the runtime's. */
  invoke?: Invoke;
}

/** Serves `handler` as a Function URL would, with static files in front. */
export async function serveFunctionUrl({
  handler,
  staticDir,
  port,
  invoke: runInvocation = invoke,
}: FunctionUrlOptions): Promise<Server> {
  const streamingHandler = handler as Handler;
  if (streamingHandler[HANDLER_STREAMING] !== STREAM_RESPONSE) {
    throw new Error('The handler is not wrapped in awslambda.streamifyResponse().');
  }

  const clients = new Map<string, ServerResponse>();

  const runtimeApi = createServer((fromRuntime, res) => {
    const match = /^\/2018-06-01\/runtime\/invocation\/([^/]+)\/response$/.exec(
      fromRuntime.url ?? '',
    );
    const client = match ? clients.get(decodeURIComponent(match[1] ?? '')) : undefined;
    if (
      client === undefined ||
      fromRuntime.headers['lambda-runtime-function-response-mode'] !== 'streaming'
    ) {
      res.writeHead(400).end();
      return;
    }
    forwardResponse(fromRuntime, client);
    fromRuntime.on('end', () => {
      res.writeHead(202, { 'content-type': 'application/json' }).end('{"status":"OK"}');
    });
  });
  await new Promise<void>((resolve) => runtimeApi.listen(0, '127.0.0.1', resolve));
  const runtimeAddress = runtimeApi.address() as AddressInfo;

  const functionUrl = createServer(async (request, client) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (STATIC_PATTERNS.some((pattern) => pattern.test(pathname))) {
      serveStatic(staticDir, pathname, client);
      return;
    }

    const requestId = randomUUID();
    clients.set(requestId, client);
    client.on('close', () => clients.delete(requestId));
    const event = await toEvent(request, requestId);
    await runInvocation(streamingHandler, event, runtimeAddress, requestId);
  });
  functionUrl.on('close', () => runtimeApi.close());

  await new Promise<void>((resolve) => functionUrl.listen(port, resolve));
  return functionUrl;
}
