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
   * Every hostname the server answers for. Angular's SSR host guard rejects any
   * request whose `host` header isn't listed, with NG05706.
   */
  allowedHosts: readonly string[];
  /**
   * The contents of `@angular/core/event-dispatch-contract.min.js`, for
   * `withEventReplay()`.
   *
   * Angular's server renderer only sets up event replay when the template
   * already holds this script: it adds the `__jsaction_bootstrap(...)` call
   * after it, or removes it when the page has nothing to replay. Without it,
   * clicks made before hydration are lost, silently. The handler puts it right
   * after `<body>` unless the template has it already, as a template built by
   * the Angular CLI or ngp's `index.server.html` does.
   *
   * With Vite: `import contract from '@angular/core/event-dispatch-contract.min.js?raw'`.
   */
  eventDispatchContract?: string;
}

/**
 * `Context` is whatever the runtime hands each request besides the `Request`
 * itself — a Worker's `env`, for instance — and is passed through to
 * `loadTemplate`.
 */
export interface StreamingHandlerOptions<Context = void> extends StreamingAppOptions {
  /**
   * Fetches the built `index.html` that the route is rendered into. A response
   * that isn't `ok` turns the page request into a 404.
   *
   * This is where runtimes differ: a Cloudflare Worker reads it through its
   * `ASSETS` binding, a Node server reads it from disk.
   */
  loadTemplate(request: Request, context: Context): Promise<Response>;
}

/** A runtime-agnostic page handler: one web `Request` in, one streamed `Response` out. */
export type StreamingHandler<Context = void> = (
  request: Request,
  context: Context,
) => Promise<Response>;

const EVENT_DISPATCH_CONTRACT_ID = 'ng-event-dispatch-contract';

/**
 * `document` with the event dispatch contract in a script right after
 * `<body>`, where the Angular CLI puts it, so it runs before anything a user
 * could click exists. Unchanged without a contract, without a `<body>` tag, or
 * when the template has the script already.
 */
function withEventDispatchContract(document: string, contract: string | undefined): string {
  if (!contract || document.includes(`id="${EVENT_DISPATCH_CONTRACT_ID}"`)) {
    return document;
  }

  // Looked for after `</head>`, so `<body` in a head script's text isn't taken for the tag.
  const from = Math.max(0, document.search(/<\/head\s*>/i));
  const match = /<body\b[^>]*>/i.exec(document.slice(from));
  if (match === null) {
    return document;
  }

  const at = from + match.index + match[0].length;
  return (
    document.slice(0, at) +
    `<script type="text/javascript" id="${EVENT_DISPATCH_CONTRACT_ID}">${contract}</script>` +
    document.slice(at)
  );
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
 * Streams the application for any runtime that speaks web `Request` and
 * `Response`. Runtime adapters wrap this and supply `loadTemplate`.
 *
 * Every request that reaches the handler is treated as a page request: static
 * assets are expected to be served before it. The handler applies the host
 * guard, loads the template and renders the route into it.
 *
 * Rendering is streamed. A hydratable shell goes out while the app's requests
 * are still in flight and the browser starts hydrating it straight away; each
 * `@defer` block follows as its data arrives. If the streaming renderer throws
 * *before* its first flush, nothing is committed yet and the handler falls back
 * to a buffered render.
 */
export function createStreamingHandler<Context = void>(
  options: StreamingHandlerOptions<Context>,
): StreamingHandler<Context> {
  const allowedHosts = new Set<string>(options.allowedHosts);
  const render = createBufferedRender(options);

  return async (request, context) => {
    const url = new URL(request.url);

    // The streaming path drives the platform directly, so it does not get
    // `renderApplication`'s host guard for free. Apply it up front, once.
    if (!ɵisHostAllowed(url.hostname, allowedHosts)) {
      return new Response('Forbidden.', { status: 403 });
    }

    const template = await options.loadTemplate(request, context);

    if (!template.ok) {
      return new Response('Not found.', { status: 404 });
    }

    const document = withEventDispatchContract(
      await template.text(),
      options.eventDispatchContract,
    );

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
  };
}
