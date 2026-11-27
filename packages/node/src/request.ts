import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * A Node request, as `node:http` hands it over or as Express and Connect pass
 * it on. Express and Connect add `originalUrl`, the URL before a mount path
 * was stripped from `url`.
 */
export type NodeRequest = IncomingMessage & { originalUrl?: string };

export interface ToWebRequestOptions {
  /**
   * Take the protocol and host from `X-Forwarded-Proto` and `X-Forwarded-Host`.
   * Turn this on only behind a proxy that sets them: anyone can send them.
   * Default: `false`, which takes the host from `Host` and the protocol from
   * the socket.
   */
  trustProxy?: boolean;
}

/**
 * A web `Request` for a Node request: the URL rebuilt from its host and
 * protocol, its headers, and its body for methods that have one.
 *
 * With `res`, the request's `signal` aborts when the client goes away before
 * the response has finished.
 */
export function toWebRequest(
  req: NodeRequest,
  res?: ServerResponse,
  options: ToWebRequestOptions = {},
): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    // HTTP/2 pseudo-headers (`:path`, `:authority`) aren't headers.
    if (value === undefined || name.startsWith(':')) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item);
    }
  }

  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = { method, headers };
  if (hasBody) {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    // Required by Node's fetch for a streamed body.
    init.duplex = 'half';
  }
  if (res) {
    init.signal = abortOnClose(res);
  }

  return new Request(requestUrl(req, options), init);
}

function requestUrl(req: NodeRequest, { trustProxy = false }: ToWebRequestOptions): string {
  const forwardedProto = trustProxy ? firstValue(req.headers['x-forwarded-proto']) : undefined;
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : 'encrypted' in req.socket && req.socket.encrypted
        ? 'https'
        : 'http';
  const host =
    (trustProxy ? firstValue(req.headers['x-forwarded-host']) : undefined) ??
    req.headers.host ??
    firstValue(req.headers[':authority']) ??
    // HTTP/1.0 may leave the host out. A name no one lists in `allowedHosts`
    // makes the host guard answer 403.
    'missing-host.invalid';
  // Joined as text: `new URL('//other.example/', base)` would take the path for a host.
  const path = req.originalUrl ?? req.url ?? '/';

  return `${protocol}://${host}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The first of a comma-separated header's values, which is the client's end of the chain. */
function firstValue(value: string | string[] | undefined): string | undefined {
  const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  return first === '' ? undefined : first;
}

/** Aborts once `res` closes without having finished: the client went away. */
function abortOnClose(res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  if (res.destroyed) {
    controller.abort();
    return controller.signal;
  }
  res.once('close', () => {
    if (!res.writableFinished) {
      controller.abort();
    }
  });
  return controller.signal;
}
