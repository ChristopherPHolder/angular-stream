import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import {
  BadRequestError,
  createTemplateLoader,
  toWebRequest,
} from '@push-based/angular-stream-node';
import Koa, { type Context } from 'koa';
import compress from 'koa-compress';
import serve from 'koa-static';
import { config } from './app/app.config.server';

/**
 * The Koa server entry. Built to dist/server/server.js, next to the template
 * (dist/server/index.server.html) and one folder away from the browser build
 * (dist/client), which is where these URLs point.
 */
const client = fileURLToPath(new URL('../client/', import.meta.url));

const render = createStreamingHandler<IncomingMessage>({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  // The built template; in `vite dev`, the dev server's, which the plugin leaves on `ctx.req`.
  loadTemplate: createTemplateLoader(new URL('./index.server.html', import.meta.url)),
});

/**
 * Renders a `GET` or `HEAD` as a page and hands the streamed body to Koa,
 * which pipes it to the socket. Other methods go on to `next`.
 */
async function page(ctx: Context, next: Koa.Next): Promise<void> {
  if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
    return next();
  }
  let request: Request;
  try {
    request = toWebRequest(ctx.req, ctx.res);
  } catch (error) {
    // A Host that is more than a host and a port: a 400 for the client, not an error to log.
    if (error instanceof BadRequestError) {
      ctx.throw(400, error.message);
    }
    throw error;
  }
  const response = await render(request, ctx.req);
  ctx.status = response.status;
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') {
      ctx.set(name, value);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    ctx.set('Set-Cookie', cookies);
  }
  // Nginx buffers proxied responses unless told not to.
  ctx.set('X-Accel-Buffering', 'no');
  if (response.body !== null) {
    ctx.body = Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>);
  }
}

const app = new Koa();

// Koa logs every error. A client that leaves mid-stream closes the response
// early, which is not one; the render has stopped by then.
app.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
    app.onerror(error);
  }
});

// Flush after every write, so each chunk leaves compressed instead of waiting for the end.
app.use(
  compress({
    gzip: { flush: zlib.constants.Z_SYNC_FLUSH },
    deflate: { flush: zlib.constants.Z_SYNC_FLUSH },
    br: { flush: zlib.constants.BROTLI_OPERATION_FLUSH },
    // zlib.constants.ZSTD_e_flush, which @types/node 20 doesn't list.
    zstd: { flush: 1 },
  }),
);

app.use(async (ctx, next) => {
  if (ctx.method === 'GET' && ctx.path === '/api/hello') {
    ctx.body = { hello: 'from Koa' };
    return;
  }
  await next();
});

if (import.meta.env.PROD) {
  // The browser build, but not its index.html: that is the bare template, and pages are rendered.
  const files = serve(client, {
    index: false,
    // Vite names the files in assets/ by their content hash.
    setHeaders: (res, file) => {
      if (path.relative(client, file).startsWith(`assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.use((ctx, next) => {
    // Decoded and lowercased as koa-send (and a case-insensitive disk) would see it,
    // so `/index%2Ehtml` and `/INDEX.HTML` are pages too.
    let decoded = ctx.path;
    try {
      decoded = decodeURIComponent(ctx.path);
    } catch {
      // Malformed: koa-send answers it.
    }
    return decoded.toLowerCase().endsWith('.html') ? next() : files(ctx, next);
  });
  // A hashed file that no longer exists (an old chunk after a deploy) is a 404, not a page.
  app.use((ctx, next) => (ctx.path.startsWith('/assets/') ? ctx.throw(404) : next()));
}

app.use(page);

// `vite dev` imports this module for its default export, and serves it itself.
export default app.callback();

if (import.meta.env.PROD) {
  const port = Number(process.env['PORT'] ?? 3000);
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
