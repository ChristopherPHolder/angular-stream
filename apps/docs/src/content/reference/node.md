```bash
npm install @push-based/angular-stream-node@next
```

The Node adapter. It depends on [`@push-based/angular-stream-core`](core.md),
whose browser providers the app still needs. For the whole setup, see
[Node](../getting-started/node.md).

Two entry points: `@push-based/angular-stream-node` for the server, and
`@push-based/angular-stream-node/vite` for the dev server. Most apps need only
`createNodeHandler()` and `angularStreamNode()`; the rest is what the handler
is made of, for adapters to other Node frameworks.

## `createNodeHandler()`

```ts
function createNodeHandler(options: NodeHandlerOptions): NodeHandler;

interface NodeHandlerOptions extends StreamingAppOptions {
  /** The built template, as a path or a file: URL. Read on the first request, then kept. */
  template: string | URL;
  /** The browser build, to serve its files from. */
  staticDir?: string | URL;
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

type NodeHandler = (
  req: NodeRequest,
  res: ServerResponse,
  next?: (error?: unknown) => void,
) => void;
```

A Node request handler that streams the application: the core's
[`createStreamingHandler()`](core.md#createstreaminghandler), with the template
read from disk, the browser build served from `staticDir`, and the response
written to the socket one chunk at a time. It is a `node:http` request
listener, and Connect and Express middleware:

```ts
createServer(handler).listen(3000);
// or
app.use(handler);
```

For each request, in order:

1. As middleware (called with `next`), a method other than `GET` and `HEAD`
   is passed on to `next()`, so routes after the handler still get their
   `POST`s. A `GET` or `HEAD` is never passed on: mount routes that answer
   those, such as an API, before the handler. Called without `next`, as a
   `node:http` listener, every method is rendered as a page.
2. With `staticDir`, a `GET` or `HEAD` for a file in it is served from disk;
   see [`createStaticHandler()`](#createstatichandler). Without `staticDir`,
   every request is rendered as a page.
3. The request becomes a web `Request` ([`toWebRequest()`](#towebrequest)).
   A `Host` that is more than a host and a port gets `400`, and a host that
   isn't in `allowedHosts` gets `403`.
4. The route is rendered into the template and the `Response` is written
   out ([`sendWebResponse()`](#sendwebresponse)), with
   `X-Accel-Buffering: no` so Nginx passes each chunk on.

If the client goes away mid-render, the response body is cancelled, which
stops the render and destroys the application. An error goes to `next` when
there is one; otherwise the handler logs it and answers `500`, or cuts the
connection when the response has already started. A
[`BadRequestError`](#badrequesterror) is answered with `400` instead, and
isn't logged.

`template` is what the route is rendered into: with ngp's `ssr` option,
`dist/server/index.server.html`. In the server entry, a URL relative to
`import.meta.url` keeps it right wherever the app is started from:

```ts
template: new URL('./index.server.html', import.meta.url),
staticDir: new URL('../client/', import.meta.url),
```

Set `trustProxy` only behind a proxy that sets `X-Forwarded-Proto` and
`X-Forwarded-Host`; anyone can send them. Without it, the URL is built from
the `Host` header and the socket.

## `angularStreamNode()`

```ts
import { angularStreamNode } from '@push-based/angular-stream-node/vite';

function angularStreamNode(options?: AngularStreamNodeOptions): Plugin;

interface AngularStreamNodeOptions {
  /** The server entry, relative to Vite's root. Default: 'src/server.ts'. */
  entry?: string;
  /** The template, relative to Vite's root. Default: 'index.html'. */
  template?: string;
  /** Requests other than pages for the server entry: path prefixes, or a function. Default: none. */
  routes?: readonly string[] | ((pathname: string, req: IncomingMessage) => boolean);
}
```

A Vite plugin for `vite dev`. Each page request loads the server entry in
Vite's `ssr` environment and calls its default export as
`(req, res, next)`, with `index.html`, as the dev server transforms it, left
on `req`. The page then loads Vite's client and the app's sources, and streams
as it does in production. Static files and modules are left to Vite, and the
handler's `template` and `staticDir` aren't read.

The server entry must default-export a `node:http` request listener and must
not start a server in dev; `if (import.meta.env.PROD)` around `listen()` does
that. The handler `createNodeHandler()` returns is one. For a server built on
another framework, see
[What the server entry default-exports](#what-the-server-entry-default-exports).

Page requests are `GET`s and `HEAD`s that ask for HTML and that Vite doesn't
serve itself; Vite answers everything else. `routes` sends the server entry
more than pages, such as the app's API, so that it answers in dev as it does
in production:

```ts
angularStreamNode({ entry: 'src/server.ts', routes: ['/api'] });
```

- A prefix matches that path and everything under it: `'/api'` matches `/api`
  and `/api/hello`, not `/api.json` or `/apis`. A prefix must start with `/`.
- A function is given the path, without the query and not decoded, and the
  request, and returns whether the server entry gets it:
  `routes: (path) => path.startsWith('/api/') || path === '/health'`.
- A matching request goes to the server entry before Vite's own middleware
  sees it, whatever its method and `Accept` header, with its URL as the
  browser sent it. It comes after Vite's CORS and host check, but before
  `server.proxy`, before `base` is stripped and before `public/`: a route
  shadows a proxied path or a file there with the same path.
- The dev template is read only if the app renders the request as a page, as
  a catch-all does for a URL under `/api` that no route answers.
- When the server entry passes the request on to `next`, Vite answers it,
  except a page request (`GET` with `Accept: text/html`), which gets a `404`,
  as it would from a production server with nothing after the app.
- `'/'` isn't allowed: it would send Vite's own requests to the app too.

List the plugin before ngp. ngp's own dev SSR would otherwise answer page
requests first, calling the default export as `(url, document)`, so the dev
server refuses to start with the plugin after ngp. In a build the plugin does
nothing.

## `toWebRequest()`

```ts
function toWebRequest(
  req: NodeRequest,
  res?: ServerResponse,
  options?: ToWebRequestOptions,
): Request;

interface ToWebRequestOptions {
  /** Take the protocol and host from X-Forwarded-Proto and X-Forwarded-Host. Default: false. */
  trustProxy?: boolean;
}

/** IncomingMessage, with the originalUrl Express and Connect add. */
type NodeRequest = IncomingMessage & { originalUrl?: string };
```

A web `Request` for a Node request. The URL is built from the protocol (the
socket's, or the first `X-Forwarded-Proto` with `trustProxy`), the host (the
`Host` header, or the first `X-Forwarded-Host` with `trustProxy`) and
`originalUrl`, falling back to `url`, so middleware mounted on a path still
renders the full URL. The headers are copied, and a method other than `GET`
and `HEAD` gets the body as a stream.

The host must be a host name or IP address with an optional port, and nothing
else; otherwise `toWebRequest()` throws a
[`BadRequestError`](#badrequesterror). Joined into the URL as it came, a
`Host` of `localhost/admin?` would pass the host guard as `localhost` and pick
the route. A path that starts with more than one slash (`//x`, or `/\x`) is
read as `/x`, as Angular's router reads it; otherwise the URL would name `x`
as its host.

With `res`, the request's `signal` aborts when `res` closes before it has
finished: the client went away.

## `BadRequestError`

```ts
class BadRequestError extends Error {
  readonly status: 400;
  readonly statusCode: 400;
}
```

What `toWebRequest()` throws for a request it can't build a URL from. Answer
it with `400`. `createNodeHandler()` does, or passes it to `next`; Express,
Connect, Koa and Fastify read `status` or `statusCode` from the errors they
are given and answer with it.

## `sendWebResponse()`

```ts
function sendWebResponse(res: ServerResponse, response: Response): Promise<void>;
```

Writes a web `Response` to a Node response: the status, the headers (each
`Set-Cookie` separately), then the body, one `res.write()` per chunk as it
arrives, waiting for `drain` when the socket is full. After each chunk it calls
`res.flush()` when there is one, which is how the `compression` middleware is
told to send what it has. A `HEAD` request gets the headers only.

It resolves once the response has ended or the client has gone away, and
doesn't reject because of the body. When the client goes away, the body is
cancelled; for a streamed render, that stops it. When the body fails before
anything has been sent, the response becomes a plain `500`. When it fails
after the headers are out, the error is logged and the connection is cut
without the closing chunk, so the client sees a broken response and not a
complete one.

## `createTemplateLoader()`

```ts
function createTemplateLoader(file: string | URL): TemplateLoader;

type TemplateLoader = (request: Request, req?: IncomingMessage) => Promise<Response>;
```

Reads `file` the first time it is called and keeps the text in memory; every
call returns a new `Response` with it. A read that fails rejects, and is tried
again on the next call. It fits the core's `loadTemplate`, with the Node
request as the context:

```ts
const render = createStreamingHandler<IncomingMessage>({
  ...app,
  loadTemplate: createTemplateLoader(templateFile),
});

await render(toWebRequest(req, res), req);
```

In `vite dev`, [`angularStreamNode()`](#angularstreamnode) leaves the dev
server's template on `req`, and the loader returns that instead of reading
`file`, which doesn't exist until a build. Pass the raw `IncomingMessage` for
`req` (Fastify's `request.raw`, Koa's `ctx.req`), or the page fails in dev.

## `createStaticHandler()`

```ts
function createStaticHandler(dir: string | URL): StaticHandler;

type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
```

Serves `GET` and `HEAD` requests for files in `dir`, and resolves `false` for
everything else: other methods, folders, paths that leave `dir`, files that
don't exist, and every `.html` file, in any case and percent-encoded or not,
so `/`, `/index.html`, `/INDEX.HTML` and `/index%2Ehtml` reach the renderer. It reads the path as `toWebRequest()` does, so `//x/favicon.svg` is
`x/favicon.svg`. It sets `Content-Type`, `Content-Length`, `ETag` and
`Last-Modified`, and answers `304` to an `If-None-Match` of `*` or a list that
holds the file's ETag. Files under
`assets/`, which Vite names by their content hash, are cached for a year;
everything else is revalidated. A `dir` that doesn't exist serves nothing.

## Building an adapter on it

`createNodeHandler()` is these pieces put together, and an adapter for another
Node framework can put them together the same way, from the raw `req` and
`res` the framework exposes:

```ts
const render = createStreamingHandler<IncomingMessage>({
  ...app,
  loadTemplate: createTemplateLoader(templateFile),
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let request: Request;
  try {
    request = toWebRequest(req, res);
  } catch (error) {
    if (!(error instanceof BadRequestError)) throw error;
    res.statusCode = 400;
    res.end(error.message);
    return;
  }
  const response = await render(request, req); // `req`: the dev template is on it
  res.setHeader('X-Accel-Buffering', 'no');
  await sendWebResponse(res, response);
}
```

Catch what `handle()` rejects with, as `createNodeHandler()` does: a rejected
promise that nothing handles stops the Node process.

### What the server entry default-exports

[`angularStreamNode()`](#angularstreamnode) calls the server entry's default
export as a `node:http` request listener, `(req, res, next)`, with the dev
template on `req`. Whatever the framework, the default export is a function of
that shape that hands `req` and `res` to the app, and the app renders pages
with a loader from `createTemplateLoader()`, given that same `req`. With
Express or Connect, that is the app itself:

```ts
const app = express();
app.use('/api', api);
app.use(handler); // createNodeHandler(), or your own handle()

export default app;

if (import.meta.env.PROD) {
  app.listen(3000);
}
```

On its own, the plugin sends the app page requests only, so in dev an API
route on the same app isn't reached. List the API's prefixes in
[`routes`](#angularstreamnode), and those requests reach it too.

Koa's is `app.callback()`. Fastify and NestJS build their own request handling
on top of `node:http`: export a function that passes `req` and `res` to the app
once it is ready, rather than the app object, and make sure the raw request
reaches `createTemplateLoader()`. For Fastify, see
[The server entry in dev](fastify.md#the-server-entry-in-dev).
