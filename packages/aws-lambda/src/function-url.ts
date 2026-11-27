import type { AwsLambdaGlobal, LambdaFunctionUrlEvent, LambdaResponseStream } from './awslambda';

/**
 * The web `Request` a Function URL event describes. The URL's host is the
 * request's `host` header: the Function URL's own hostname, also when
 * CloudFront is in front of it.
 */
export function toRequest(event: LambdaFunctionUrlEvent): Request {
  const host = event.headers['host'] ?? event.requestContext.domainName;
  const protocol = event.headers['x-forwarded-proto'] ?? 'https';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';

  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers)) {
    if (value !== undefined) {
      headers.set(name, value);
    }
  }
  // Payload 2.0 moves the cookie header into `cookies`.
  if (event.cookies?.length) {
    headers.set('cookie', event.cookies.join('; '));
  }

  const method = event.requestContext.http.method;
  const hasBody = event.body !== undefined && method !== 'GET' && method !== 'HEAD';

  return new Request(`${protocol}://${host}${event.rawPath}${query}`, {
    method,
    headers,
    body: hasBody
      ? event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64')
        : event.body
      : undefined,
  });
}

/**
 * Writes `response` to a Lambda response stream as an HTTP response: status
 * and headers in the metadata prelude, then each chunk of the body as it
 * arrives. Resolves once the stream has finished.
 */
export async function writeResponse(
  response: Response,
  responseStream: LambdaResponseStream,
  lambda: AwsLambdaGlobal,
  method: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') {
      headers[name] = value;
    }
  });
  const cookies = response.headers.getSetCookie();

  const stream = lambda.HttpResponseStream.from(responseStream, {
    statusCode: response.status,
    headers,
    ...(cookies.length > 0 ? { cookies } : {}),
  });

  // The prelude goes out with the first write. Writing nothing sends it now,
  // so the client gets the status and headers before the first chunk, and a
  // response without a body still gets its status.
  stream.write(new Uint8Array(0));

  if (response.body === null || method === 'HEAD') {
    await response.body?.cancel();
  } else {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!stream.write(value)) {
          await streamEvent(stream, 'drain');
        }
      }
    } catch (error) {
      // Stops the render when the stream fails; rethrown, so the runtime
      // reports the invocation as failed.
      await reader.cancel(error).catch(() => undefined);
      throw error;
    }
  }

  const finished = streamEvent(stream, 'finish');
  stream.end();
  await finished;
}

/**
 * Resolves on `event` (`drain`: it can take more; `finish`: everything is
 * written). Rejects when the stream fails or closes first, or already has.
 *
 * The stream is closed when the runtime's connection to the Runtime API
 * drops. Its `close` and `error` events have fired by then, and a write or
 * `end()` neither fails nor calls back, so without the check up front the
 * handler would wait until the function times out.
 */
function streamEvent(stream: LambdaResponseStream, event: 'drain' | 'finish'): Promise<void> {
  if (stream.destroyed || (event === 'drain' && stream.writableEnded)) {
    return Promise.reject(closedError());
  }
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      cleanUp();
      resolve();
    };
    const onError = (error: Error) => {
      cleanUp();
      reject(error);
    };
    const onClose = () => {
      cleanUp();
      reject(closedError());
    };
    const cleanUp = () => {
      stream.off(event, onEvent);
      stream.off('error', onError);
      stream.off('close', onClose);
    };

    stream.once(event, onEvent);
    stream.once('error', onError);
    stream.once('close', onClose);
  });
}

function closedError(): Error {
  return new Error('The response stream closed before the response was written.');
}
