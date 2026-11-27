```bash
npm install @push-based/angular-stream-cloudflare@next
```

The Cloudflare Workers adapter. It depends on
[`@push-based/angular-stream-core`](core.md), whose browser providers the app
still needs. For the whole setup, see
[Cloudflare Workers](../getting-started/cloudflare-workers.md).

## `createStreamingWorker()`

```ts
function createStreamingWorker(options: StreamingAppOptions): {
  fetch(request: Request, env: StreamingWorkerEnv): Promise<Response>;
};

interface StreamingAppOptions {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /** The application's server config, provideServerRendering() included. */
  config: ApplicationConfig;
  /** Every hostname the Worker answers for. */
  allowedHosts: readonly string[];
}
```

A Worker `fetch` handler that streams the application: the core's
[`createStreamingHandler()`](core.md#createstreaminghandler), with the template
fetched as `/index.html` through the `ASSETS` binding. Export it as the
Worker's default export:

```ts title="src/worker.ts"
export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

Set `assets.html_handling` to `"none"` in `wrangler.jsonc`, so that static
assets are served before a request reaches the Worker and every navigation
falls through to it. In `vite dev` the binding is backed by the Vite dev
server, so the template already carries Vite's dev transforms.

## `StreamingWorkerEnv`

```ts
interface StreamingWorkerEnv {
  ASSETS: AssetsBinding;
}

/** The part of the Workers ASSETS binding the handler uses. */
interface AssetsBinding {
  fetch(input: URL | string): Promise<Response>;
}
```

The bindings the handler needs from the Worker's `env`. The binding must be
named `ASSETS`.
