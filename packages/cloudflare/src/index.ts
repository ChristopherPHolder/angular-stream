import {
  type StreamingAppOptions,
  createStreamingHandler,
} from '@push-based/angular-ssr-stream-core/server';

export type { StreamingAppOptions } from '@push-based/angular-ssr-stream-core/server';

/** The part of the Workers `ASSETS` binding the handler uses. */
export interface AssetsBinding {
  fetch(input: URL | string): Promise<Response>;
}

/** The bindings `createStreamingWorker()` needs from the Worker's `env`. */
export interface StreamingWorkerEnv {
  ASSETS: AssetsBinding;
}

/**
 * A Cloudflare Worker `fetch` handler that streams the application.
 *
 * Set `assets.html_handling` to `"none"` in `wrangler.jsonc`: static assets are
 * then served by the asset worker before a request reaches here, and every
 * navigation falls through to it. The built `index.html` is fetched through
 * the `ASSETS` binding and the route is rendered into it.
 *
 * In `vite dev` the binding is backed by the Vite dev server, so the template
 * already carries Vite's dev transforms.
 */
export function createStreamingWorker(options: StreamingAppOptions): {
  fetch(request: Request, env: StreamingWorkerEnv): Promise<Response>;
} {
  const handle = createStreamingHandler<StreamingWorkerEnv>({
    ...options,
    loadTemplate: (request, env) => env.ASSETS.fetch(new URL('/index.html', request.url)),
  });

  return { fetch: handle };
}
