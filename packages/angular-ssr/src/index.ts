import { RenderMode } from '@angular/ssr';
import type { StreamingBootstrap } from '@push-based/angular-ssr-stream-core/server';
import type { streamingRenderer } from './renderer';

export type { StreamingRouteRender } from './renderer';

/**
 * What `withStreaming()` takes: `AngularAppEngine` from `@angular/ssr`, or
 * `AngularNodeAppEngine` from `@angular/ssr/node`.
 */
export interface AngularEngine {
  handle(request: never, requestContext?: unknown): Promise<Response | null>;
}

/** The route `@angular/ssr` matched a request to, as its server app sees it. */
interface MatchedRoute {
  renderMode: RenderMode;
  status?: number;
  headers?: Record<string, string>;
  preload?: readonly string[];
}

/** The parts of `@angular/ssr`'s `AngularServerApp` used here. */
interface ServerApp {
  manifest: {
    bootstrap: () => Promise<unknown>;
    locale?: string;
  };
  assets: { getIndexServerHtml(): { text(): Promise<string> } };
  handleRendering(
    request: Request,
    matchedRoute: MatchedRoute,
    requestContext?: unknown,
  ): Promise<Response | null>;
  runTransformsOnHtml?(html: string, url: URL, preload?: readonly string[]): Promise<string>;
  inlineCriticalCss?(html: string): string;
}

/** What `src/main.server.ts` exports, with `streamingRenderer` added. */
interface EntryPointExports {
  streamingRenderer?: typeof streamingRenderer;
}

/** The parts of `@angular/ssr`'s `AngularAppEngine` used here. */
interface AppEngine {
  getAngularServerAppForRequest(request: Request): Promise<ServerApp | null>;
  getEntryPointExportsForUrl(url: URL): Promise<EntryPointExports> | undefined;
}

const patchedEngines = new WeakSet<object>();
const patchedApps = new WeakSet<object>();
let warnedAboutRenderer = false;

/**
 * Streams the routes `@angular/ssr` renders on the server. Everything else
 * stays `@angular/ssr`'s: the host check, server routes and their render
 * modes, redirects, prerendered pages, client-rendered routes and locales.
 *
 * ```ts
 * // src/server.ts
 * const angularApp = withStreaming(new AngularNodeAppEngine());
 *
 * // src/main.server.ts
 * export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';
 * ```
 *
 * A route with `RenderMode.Server` is rendered by the streaming renderer: the
 * shell goes out once the route and its `@defer` blocks are in place, and each
 * `@defer` block with a `hydrate` trigger follows as its data arrives. The
 * route's status and headers apply, and so does anything the app sets on
 * `RESPONSE_INIT` before the shell goes out. Critical CSS is inlined into the
 * shell. If streaming fails before anything is sent, or `main.server.ts`
 * doesn't export `streamingRenderer`, the route is rendered by `@angular/ssr`
 * as usual.
 *
 * The app config needs `provideStreamHydration()`, after
 * `provideClientHydration()`, and `streamHttpInterceptor` in `HttpClient`'s
 * interceptors.
 *
 * Returns the engine it was given.
 */
export function withStreaming<Engine extends AngularEngine>(engine: Engine): Engine {
  const appEngine = findAppEngine(engine);
  if (patchedEngines.has(appEngine)) {
    return engine;
  }
  patchedEngines.add(appEngine);

  const getServerApp = appEngine.getAngularServerAppForRequest.bind(appEngine);
  appEngine.getAngularServerAppForRequest = async (request) => {
    const serverApp = await getServerApp(request);
    if (serverApp !== null && !patchedApps.has(serverApp)) {
      patchedApps.add(serverApp);
      const entryPoint = await appEngine.getEntryPointExportsForUrl(new URL(request.url));
      const render = entryPoint?.streamingRenderer;
      if (typeof render === 'function') {
        streamServerRoutes(serverApp, render);
      } else {
        warnAboutRenderer();
      }
    }
    return serverApp;
  };

  return engine;
}

/** `AngularNodeAppEngine` wraps an `AngularAppEngine`; that is the one to patch. */
function findAppEngine(engine: AngularEngine): AppEngine {
  const inner = (engine as { angularAppEngine?: unknown }).angularAppEngine ?? engine;
  const candidate = inner as Partial<AppEngine>;
  if (
    typeof candidate.getAngularServerAppForRequest !== 'function' ||
    typeof candidate.getEntryPointExportsForUrl !== 'function'
  ) {
    throw new Error(
      '[angular-ssr-stream] withStreaming() expects an AngularAppEngine or AngularNodeAppEngine ' +
        'from a version of @angular/ssr it supports.',
    );
  }
  return inner as AppEngine;
}

function streamServerRoutes(serverApp: ServerApp, render: typeof streamingRenderer): void {
  const renderBuffered = serverApp.handleRendering.bind(serverApp);
  let bootstrap: Promise<unknown> | undefined;

  serverApp.handleRendering = async (request, matchedRoute, requestContext) => {
    if (matchedRoute.renderMode !== RenderMode.Server) {
      return renderBuffered(request, matchedRoute, requestContext);
    }

    bootstrap ??= serverApp.manifest.bootstrap();
    const appBootstrap = await bootstrap;
    if (typeof appBootstrap !== 'function' || 'ɵmod' in appBootstrap) {
      // An NgModule: not something the streaming renderer bootstraps.
      return renderBuffered(request, matchedRoute, requestContext);
    }

    const url = stripIndexHtml(new URL(request.url));
    const { locale } = serverApp.manifest;
    let document = await serverApp.assets.getIndexServerHtml().text();
    if (serverApp.runTransformsOnHtml !== undefined) {
      document = await serverApp.runTransformsOnHtml(document, url, matchedRoute.preload);
    }

    try {
      const response = await render({
        bootstrap: appBootstrap as StreamingBootstrap,
        document,
        request,
        url,
        requestContext,
        locale,
        responseInit: {
          status: matchedRoute.status,
          headers: new Headers({
            ...(locale === undefined ? {} : { 'Content-Language': locale }),
            ...matchedRoute.headers,
          }),
        },
        transformDocument: (html) => serverApp.inlineCriticalCss?.(html) ?? html,
      });
      // Nginx buffers proxied responses unless told not to, which would hold
      // the shell back until the last chunk. Other proxies ignore it.
      if (response?.body && !response.headers.has('X-Accel-Buffering')) {
        response.headers.set('X-Accel-Buffering', 'no');
      }
      return response;
    } catch (error) {
      if (request.signal.aborted) {
        return null;
      }
      console.error('[ssr] streaming render failed before commit, falling back', error);
      return renderBuffered(request, matchedRoute, requestContext);
    }
  };
}

function warnAboutRenderer(): void {
  if (warnedAboutRenderer) {
    return;
  }
  warnedAboutRenderer = true;
  console.warn(
    "[ssr] withStreaming(): src/main.server.ts doesn't export streamingRenderer, so pages are " +
      "rendered without streaming. Add: export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';",
  );
}

/** `/a/index.html` renders as `/a/`, as `@angular/ssr` has it. */
function stripIndexHtml(url: URL): URL {
  if (url.pathname.endsWith('/index.html')) {
    const stripped = new URL(url);
    stripped.pathname = url.pathname.slice(0, -'index.html'.length);
    return stripped;
  }
  return url;
}
