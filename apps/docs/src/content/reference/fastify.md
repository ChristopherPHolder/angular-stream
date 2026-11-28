```bash
npm install @push-based/angular-ssr-stream-fastify@next fastify
```

The Fastify plugin. It is built on the [Node adapter](node.md), and depends on
[`@push-based/angular-ssr-stream-core`](core.md), whose browser providers the app
still needs. It needs Fastify 5. For the whole setup, see
[Fastify](../getting-started/fastify.md).

## `angularStream`

```ts
import { angularStream } from '@push-based/angular-ssr-stream-fastify';

const angularStream: FastifyPluginAsync<AngularStreamOptions>;

interface AngularStreamOptions extends FastifyHandlerOptions {
  /** Options for the page route, as fastify.get(path, options, handler) takes them. */
  route?: RouteShorthandOptions;
}

interface FastifyHandlerOptions extends StreamingAppOptions {
  /** The built template, as a path or a file: URL. Read on the first request, then kept. */
  template: string | URL;
  /** Take the protocol and host from X-Forwarded-Proto and X-Forwarded-Host. Default: false. */
  trustProxy?: boolean;
}

interface StreamingAppOptions {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /** The application's server config, provideServerRendering() included. */
  config: ApplicationConfig;
  /** Every hostname the server answers for. */
  allowedHosts: readonly string[];
  /** The contents of @angular/core/event-dispatch-contract.min.js, for withEventReplay(). */
  eventDispatchContract?: string;
}
```

A Fastify plugin that renders the application. Register it like any other:

```ts
app.register(angularStream, {
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.com'],
  template: new URL('./index.server.html', import.meta.url),
});
```

It adds one route, `GET` and `HEAD` on `/*`, under the `prefix` it is
registered with, with [`createFastifyHandler()`](#createfastifyhandler) as its
handler. Fastify answers a URL with its most specific route, so the plugin
renders only what no other route answers: register an API, and the browser
build with [`@fastify/static`](#fastifystatic), in any order. Other methods
aren't routed to it, and get Fastify's `404`.

For each request:

1. The raw request becomes a web `Request`, with the Node adapter's
   [`toWebRequest()`](node.md#towebrequest). A `Host` that is more than a host
   and a port throws a [`BadRequestError`](#badrequesterror), and a host that
   isn't in `allowedHosts` gets `403`.
2. The template is loaded with the Node adapter's
   [`createTemplateLoader()`](node.md#createtemplateloader), given the raw
   request: in `vite dev`, that is where the dev template is.
3. The route is rendered, and the `Response` handed to Fastify: its status and
   headers (each `Set-Cookie` separately) set on the reply, with
   `X-Accel-Buffering: no` so Nginx passes each chunk on, and its body sent
   with `reply.send()` as a Node stream. A `HEAD` request gets the headers, and
   the render is cancelled.

`template` is what the route is rendered into: with ngp's `ssr` option,
`dist/server/index.server.html`. In the server entry, a URL relative to
`import.meta.url` keeps it right wherever the app is started from.

Set `trustProxy` only behind a proxy that sets `X-Forwarded-Proto` and
`X-Forwarded-Host`; anyone can send them. Without it, the URL is built from
the `Host` header and the socket. Fastify's own `trustProxy` server option
doesn't change the URL a page is rendered for; set both.

### How the page is sent

The body goes through `reply.send()`, as a `Readable` made from the
`Response`'s body. Fastify pipes it to the socket: each chunk is written as the
renderer produces it, with chunked encoding and no `Content-Length`. The reply
stays Fastify's, so:

- **`onSend` hooks** run, and get the page as a stream. `@fastify/compress`
  replaces it with a compressed stream; see [`@fastify/compress`](#fastifycompress).
  A hook of your own that passes the payload on doesn't hold anything back.
  One that reads the stream to the end, to rewrite the page or to hash it,
  holds the whole page until the render is done.
- **Headers** set with `reply.header()` by earlier hooks (`onRequest`,
  `preHandler`) are sent with the page.
- **Logging** works as for any route: Fastify logs the request when it comes
  in, and `request completed`, with the response time, once the last chunk is
  out. Neither waits for the body.
- **Errors** go to Fastify's error handler, yours if you set one with
  `setErrorHandler()`. A `BadRequestError` is answered with `400`, since it
  carries `statusCode`; anything else that fails before the page has started
  is a `500`. A render that fails part-way cuts the connection, so the client
  sees a broken response and not a complete one.

The plugin doesn't call `reply.hijack()` and write the response to `reply.raw`
itself, as the Node adapter's `sendWebResponse()` would: Fastify then skips the
`onSend` hooks, so pages would silently go uncompressed, and drops the headers
other hooks set on the reply.

### When the client goes away

When the connection closes before the page is complete, Fastify destroys the
stream it was piping, which cancels the `Response`'s body; the render stops
and the application is destroyed. That holds at any point, before the shell
too, and for a compressed page.

### Route options

`route` is passed to the page route, as the options argument of
`fastify.get(path, options, handler)`; `method`, `url` and `handler` are the
plugin's. With it:

```ts
// Leave pages out of @fastify/compress.
route: { compress: false },
// A longer handlerTimeout for pages than the server's.
route: { handlerTimeout: 30_000 },
// Log pages at a different level, or add hooks for pages only.
route: { logLevel: 'warn', onRequest: [checkSession] },
```

Fastify's `handlerTimeout`, when you set one, is measured to the end of the
streamed response, not to the shell. When it runs out mid-page, Fastify cuts
the connection, so give pages one longer than the slowest block takes.

## `createFastifyHandler()`

```ts
import { createFastifyHandler } from '@push-based/angular-ssr-stream-fastify';

function createFastifyHandler(options: FastifyHandlerOptions): FastifyHandler;

type FastifyHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;
```

The page route's handler on its own, for a route of your own: the steps
above, from the web `Request` to `reply.send()`, for whatever URL the route
matched. The plugin is this handler on `GET` and `HEAD` `/*`. Use it to
decide in front of it which requests are pages, or to mount it where a
plugin doesn't fit:

```ts
const render = createFastifyHandler({
  rootComponent: App,
  config,
  allowedHosts: ['localhost'],
  template: new URL('./index.server.html', import.meta.url),
});

app.get('/*', async (request, reply) => {
  if (request.url.startsWith('/admin/')) {
    return reply.callNotFound();
  }
  return render(request, reply);
});
```

It rejects with a [`BadRequestError`](#badrequesterror) for a `Host` it can't
build a URL from; a route that wraps it can map that to an error of its own.
The NestJS module's route on `@nestjs/platform-fastify` is built this way; see
[On Fastify](nestjs.md#on-fastify).

## `@fastify/static`

The plugin doesn't serve the browser build; `@fastify/static` does, with two
options:

```ts
app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../client/', import.meta.url)),
  wildcard: false,
  globIgnore: ['**/*.html'],
});
```

- **`wildcard: false`**: by default, `@fastify/static` registers a `GET /*`
  route of its own, and Fastify refuses to start with two
  (`FST_ERR_DUPLICATED_ROUTE`). Without it, it registers one route per file it
  finds at startup, which wins over the page route.
- **`globIgnore: ['**/*.html']`**: `dist/client/index.html` is the browser
  build's copy of the template. Served as a file, `/` and `/index.html` would
  answer with the unrendered template.

A request for a file that isn't there has no route of its own, and is
rendered as a page, unless something answers it first: the example adds
`app.get('/assets/*', (_request, reply) => reply.callNotFound())`, so an old
script name after a deploy gets a `404`.

## `@fastify/compress`

`@fastify/compress` streams a page only with `flushOnIdle: true`, which
flushes the compressor each time the page pauses, after each burst of chunks. Without it, the compressed
page arrives in one piece once the render is done. Register it before the
plugin; it only applies to routes added after it has loaded.

```ts
app.register(fastifyCompress, { flushOnIdle: true });
```

Or leave pages out with `route: { compress: false }`, and compress them in a
proxy in front. Check either way with `curl --compressed`; see
[Streaming through proxies](../guides/streaming-through-proxies.md#compression-middleware).

## The server entry in dev

In `vite dev`, the Node adapter's
[`angularStreamNode()`](node.md#angularstreamnode) imports the server entry and
calls its default export as a `node:http` request listener,
`(req, res, next)`, with the dev template left on `req`. A Fastify instance
isn't one; default-export a function that waits for the app and hands the raw
request to Fastify's router:

```ts
export default function handle(
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  next: (error?: unknown) => void,
): void {
  req.url = req.originalUrl ?? req.url;
  app.ready().then(() => app.routing(req, res), next);
}

if (import.meta.env.PROD) {
  app.listen({ port: 3000 });
}
```

- `app.ready()` loads the plugins, once; `app.routing(req, res)` is Fastify's
  router, as `app.listen()` would call it. A plugin that fails to load is
  passed to `next`, and Vite shows the error.
- `req.url` is set back to the URL the browser asked for. Vite rewrites page
  requests to `/index.html` before the plugin sees them; the page route would
  still render the right URL, which it takes from `originalUrl`, but Fastify
  would route and log `/index.html`.
- `listen()` only in production: in dev, the Vite server is the one listening.

Page requests reach the default export in dev, `GET`s and `HEAD`s that ask
for HTML, and so does every request the plugin's
[`routes`](node.md#angularstreamnode) names, such as `routes: ['/api']`. Vite
answers the rest.

## `BadRequestError`

```ts
import { BadRequestError } from '@push-based/angular-ssr-stream-fastify';
```

The Node adapter's [`BadRequestError`](node.md#badrequesterror), exported
again: what the page route throws for a `Host` it can't build a URL from.
Fastify's default error handler answers it with `400`. In an error handler of
your own, `error instanceof BadRequestError` tells it apart.

## Building on it

The plugin is an ordinary async Fastify plugin, encapsulated: it isn't wrapped
in `fastify-plugin`, adds no decorators, and registers nothing outside its own
context but the route. Anything that hands you the Fastify instance can
register it as above, or mount [`createFastifyHandler()`](#createfastifyhandler)
on a route of its own. For NestJS on `@nestjs/platform-fastify`, use the
[NestJS module](nestjs.md), which does that.
