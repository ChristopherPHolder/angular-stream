import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * A Node request, as `node:http` hands it over or as Express and Connect pass
 * it on. Express and Connect add `originalUrl`, the URL before a mount path
 * was stripped from `url`.
 */
export type NodeRequest = IncomingMessage & { originalUrl?: string };

/**
 * Thrown by `toWebRequest()` for a request no page can be rendered for, such
 * as a `Host` header that is more than a host and a port. Answer it with its
 * `status`, 400. Express, Connect, Koa and Fastify read `status` or
 * `statusCode` from an error passed on to them, and answer with it.
 */
export class BadRequestError extends Error {
  readonly status = 400;
  readonly statusCode = 400;
  override readonly name = 'BadRequestError';
}

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
 *
 * Throws a `BadRequestError` when the host it would use (`Host`, or
 * `X-Forwarded-Host` with `trustProxy`) isn't a host with an optional port.
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
  const forwardedHost = trustProxy ? firstValue(req.headers['x-forwarded-host']) : undefined;
  const host = checkedHost(
    forwardedHost ??
      req.headers.host ??
      firstValue(req.headers[':authority']) ??
      // HTTP/1.0 may leave the host out. A name no one lists in `allowedHosts`
      // makes the host guard answer 403.
      'missing-host.invalid',
    forwardedHost === undefined ? 'Host' : 'X-Forwarded-Host',
  );

  // Joined as text: `new URL('//other.example/', base)` would take the path for a host.
  return `${protocol}://${host}${requestPath(req.originalUrl ?? req.url ?? '/')}`;
}

/**
 * The host and port of a `Host` header, as the URL parser writes them, or a
 * `BadRequestError` when the header holds anything else. Joined into the URL
 * as it came, `localhost/admin?` would pass the host guard as `localhost` and
 * choose the route; `localhost:abc` would make `new Request()` throw.
 */
function checkedHost(value: string, header: string): string {
  let url: URL | undefined;
  try {
    url = /[/\\?#@]/.test(value) ? undefined : new URL(`http://${value}`);
  } catch {
    url = undefined;
  }
  if (
    url === undefined ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new BadRequestError(`Bad request: ${header} is not a host name with an optional port.`);
  }
  return url.host;
}

/**
 * The path and query of a request target, with exactly one leading slash.
 * `//x` and `/\x` would read as a URL on the host `x` (Angular answers
 * those with NG05702); Angular's router reads them as `/x`, and so does this.
 */
export function requestPath(target: string): string {
  return target.replace(/^[/\\]*/, '/');
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
