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

1. With `staticDir`, a `GET` or `HEAD` for a file in it is served from disk;
   see [`createStaticHandler()`](#createstatichandler). Without `staticDir`,
   every request is rendered as a page.
2. The request becomes a web `Request` ([`toWebRequest()`](#towebrequest)).
   A host that isn't in `allowedHosts` gets `403`.
3. The route is rendered into the template and the `Response` is written
   out ([`sendWebResponse()`](#sendwebresponse)), with
   `X-Accel-Buffering: no` so Nginx passes each chunk on.

If the client goes away mid-render, the response body is cancelled, which
stops the render and destroys the application. An error goes to `next` when
there is one; otherwise the handler logs it and answers `500`, or cuts the
connection when the response has already started.

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
}
```

A Vite plugin for `vite dev`. Each page request loads the server entry in
Vite's `ssr` environment and calls its default export, the handler
`createNodeHandler()` returned, with `index.html` as the dev server transforms
it. The page then loads Vite's client and the app's sources, and streams as it
does in production. Static files and modules are left to Vite, and the
handler's `template` and `staticDir` aren't read.

The server entry must default-export the handler and must not start a server
in dev; `if (import.meta.env.PROD)` around `listen()` does that. List the
plugin before ngp, whose own dev SSR would otherwise answer page requests with
a page rendered all at once. In a build it does nothing.

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

With `res`, the request's `signal` aborts when `res` closes before it has
finished: the client went away.

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
cancelled; for a streamed render, that stops it. When the body fails after the
headers are out, the connection is cut without the closing chunk, so the client
sees a broken response and not a complete one.

## `createTemplateLoader()`

```ts
function createTemplateLoader(file: string | URL): () => Promise<Response>;
```

Reads `file` the first time it is called and keeps the text in memory; every
call returns a new `Response` with it. A read that fails rejects, and is tried
again on the next call. It fits the core's `loadTemplate`:

```ts
createStreamingHandler({ ...app, loadTemplate: createTemplateLoader(templateFile) });
```

## `createStaticHandler()`

```ts
function createStaticHandler(dir: string | URL): StaticHandler;

type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
```

Serves `GET` and `HEAD` requests for files in `dir`, and resolves `false` for
everything else: other methods, folders, paths that leave `dir`, files that
don't exist, and every `.html` file, so `/` and `/index.html` reach the
renderer. It sets `Content-Type`, `Content-Length`, `ETag` and
`Last-Modified`, and answers a matching `If-None-Match` with `304`. Files under
`assets/`, which Vite names by their content hash, are cached for a year;
everything else is revalidated. A `dir` that doesn't exist serves nothing.

## Building an adapter on it

`createNodeHandler()` is these pieces put together, and an adapter for another
Node framework can put them together the same way, from the raw `req` and
`res` the framework exposes:

```ts
const render = createStreamingHandler({ ...app, loadTemplate: createTemplateLoader(templateFile) });

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const response = await render(toWebRequest(req, res));
  res.setHeader('X-Accel-Buffering', 'no');
  await sendWebResponse(res, response);
}
```
