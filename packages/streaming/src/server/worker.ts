import {
  type ApplicationConfig,
  type Type,
  mergeApplicationConfig,
  ɵIS_INCREMENTAL_HYDRATION_ENABLED,
} from '@angular/core';
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { renderApplication, ɵisHostAllowed } from '@angular/platform-server';
import { renderStreamingAngular } from './streaming-angular-renderer';

export interface StreamingAppOptions {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /** The application's server config, `provideServerRendering()` included. */
  config: ApplicationConfig;
  /**
   * Every hostname the Worker answers for. Angular's SSR host guard rejects any
   * request whose `host` header isn't listed, with NG05706.
   */
  allowedHosts: readonly string[];
}

/** The part of the Workers `ASSETS` binding the handler uses. */
export interface AssetsBinding {
  fetch(input: URL | string): Promise<Response>;
}

/**
 * Buffered render: one string, once the application is stable.
 *
 * The fallback for when the streaming renderer fails before it has committed
 * anything to the wire.
 *
 * It renders without incremental hydration: `@defer` blocks are left for the
 * client to render, from the transfer state this render fills. Angular renders
 * a `hydrate when` block during a template update on the server, which fails
 * with NG0600 whenever the surrounding component has signal queries. The
 * streaming renderer works around that by rendering the blocks itself;
 * `renderApplication` offers no place to do the same.
 */
export function createBufferedRender({
  rootComponent,
  config,
  allowedHosts,
}: StreamingAppOptions): (url: string, document: string) => Promise<string> {
  const bufferedConfig = mergeApplicationConfig(config, {
    providers: [{ provide: ɵIS_INCREMENTAL_HYDRATION_ENABLED, useValue: false }],
  });

  return (url, document) =>
    renderApplication(
      (context: BootstrapContext) => bootstrapApplication(rootComponent, bufferedConfig, context),
      { document, url, allowedHosts: [...allowedHosts] },
    );
}

/**
 * A Cloudflare Worker `fetch` handler that streams the application.
 *
 * Static assets are served by the asset worker before a request reaches here,
 * so everything that arrives is a page request: fetch the built `index.html`
 * through the `ASSETS` binding and render the route into it.
 *
 * In `vite dev` the binding is backed by the Vite dev server, so the template
 * already carries Vite's dev transforms.
 *
 * Rendering is streamed. A hydratable shell goes out while the app's requests
 * are still in flight and the browser starts hydrating it straight away; each
 * `@defer` block follows as its data arrives. If the streaming renderer throws
 * *before* its first flush, nothing is committed yet and the handler falls back
 * to a buffered render.
 */
export function createStreamingWorker(options: StreamingAppOptions): {
  fetch(request: Request, env: { ASSETS: AssetsBinding }): Promise<Response>;
} {
  const allowedHosts = new Set<string>(options.allowedHosts);
  const render = createBufferedRender(options);

  return {
    async fetch(request, env) {
      const url = new URL(request.url);

      // The streaming path drives the platform directly, so it does not get
      // `renderApplication`'s host guard for free. Apply it up front, once.
      if (!ɵisHostAllowed(url.hostname, allowedHosts)) {
        return new Response('Forbidden.', { status: 403 });
      }

      const template = await env.ASSETS.fetch(new URL('/index.html', request.url));

      if (!template.ok) {
        return new Response('Not found.', { status: 404 });
      }

      const document = await template.text();

      try {
        return await renderStreamingAngular({
          rootComponent: options.rootComponent,
          config: options.config,
          document,
          url: request.url,
        });
      } catch (error) {
        console.error('[ssr] streaming render failed before commit, falling back', error);
        const html = await render(request.url, document);

        return new Response(html, {
          headers: { 'content-type': 'text/html;charset=utf-8' },
        });
      }
    },
  };
}
