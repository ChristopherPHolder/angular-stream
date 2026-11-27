import type { ServerResponse } from 'node:http';

/**
 * `ServerResponse` as compression middleware leaves it: `compression` adds
 * `flush()`, which pushes out what it has compressed so far.
 */
type FlushableResponse = ServerResponse & { flush?: () => void };

/**
 * Writes a web `Response` to a Node response: the status, the headers, then
 * the body one chunk at a time, each written to the socket as soon as it
 * arrives.
 *
 * Resolves once the response has ended or the client has gone away, and never
 * rejects for the body:
 *
 * - When the client goes away, the body is cancelled. For a streamed render,
 *   that stops the render and tears the application down.
 * - When the body fails part-way, the connection is cut without the closing
 *   chunk, so the client sees a broken response and not a complete one.
 *
 * After each chunk it calls `res.flush()` when there is one, so compression
 * middleware that adds it (`compression`) sends the chunk instead of holding
 * it back.
 */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  if (response.statusText) {
    res.statusMessage = response.statusText;
  }
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') {
      res.setHeader(name, value);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    res.setHeader('set-cookie', cookies);
  }

  const body = response.body;
  if (body === null || res.req?.method === 'HEAD') {
    await body?.cancel().catch(() => undefined);
    res.end();
    return;
  }

  const reader = body.getReader();
  let closed = res.destroyed;
  const onClose = () => {
    closed = true;
    // Resolves a pending `read()` with `done`, and tells the source to stop.
    reader.cancel().catch(() => undefined);
  };
  res.once('close', onClose);

  try {
    while (!closed) {
      const { done, value } = await reader.read();
      if (done || closed) {
        break;
      }
      const flushed = res.write(value);
      (res as FlushableResponse).flush?.();
      if (!flushed) {
        await drained(res);
      }
    }
    if (closed) {
      await reader.cancel().catch(() => undefined);
    } else {
      res.end();
    }
  } catch {
    // The body failed after the headers went out. Ending normally would pass a
    // partial page off as a whole one; a cut connection says what happened.
    res.destroy();
  } finally {
    res.off('close', onClose);
  }
}

/** Resolves once `res` can take more, or has closed. */
function drained(res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });
}
