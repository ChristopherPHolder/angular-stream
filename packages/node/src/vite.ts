import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
// Types only: an app that uses this plugin has Vite.
import type { Plugin, RunnableDevEnvironment } from 'vite';
import type { NodeHandler } from './handler';

/**
 * `DEV_TEMPLATE` in `./template`, restated: this module imports nothing of the
 * package at runtime, so Vite's config loader can load it from source.
 */
const DEV_TEMPLATE = Symbol.for('@push-based/angular-ssr-stream-node:template');

const PLUGIN_NAME = 'angular-ssr-stream-node';
/** The name of the plugin `ngp()` from `@push-based/vite-plugin-ngp` returns first. */
const NGP_PLUGIN_NAME = 'vite-plugin-ngp';

/** A request as Vite's Connect middleware gets it. */
type DevRequest = IncomingMessage & { originalUrl?: string };
type Next = (error?: unknown) => void;

export interface AngularStreamNodeOptions {
  /**
   * The server entry, relative to Vite's root. Its default export is a
   * `node:http` request listener, such as the handler `createNodeHandler()`
   * returns. Default: `src/server.ts`.
   */
  entry?: string;
  /** The template, relative to Vite's root. Default: `index.html`. */
  template?: string;
  /**
   * Requests other than pages that go to the server entry too, such as the
   * app's API routes. Either path prefixes, where `'/api'` matches `/api` and
   * everything under `/api/` but not `/api.json`, or a function that is given
   * the path (without the query, not decoded) and the request.
   *
   * A matching request goes to the server entry before Vite's own middleware
   * sees it, whatever its method and `Accept` header. Default: none, only
   * pages go to the server entry.
   */
  routes?: readonly string[] | ((pathname: string, req: IncomingMessage) => boolean);
}

/**
 * Streams pages in `vite dev` through the app's own handler.
 *
 * Each page request loads the server entry in Vite's `ssr` environment and
 * calls its default export, the handler `createNodeHandler()` returned, with
 * `index.html` as the dev server transforms it: the template carries Vite's
 * client and the app's entry as source, the way the `ASSETS` binding gives a
 * Worker in dev. Static files and modules are left to Vite, and so is every
 * other request, unless `routes` names it.
 *
 * List it before ngp, whose own SSR middleware would otherwise call the
 * handler as `(url, document)`, which it isn't. The dev server refuses to start
 * when it comes after ngp.
 *
 * The server entry's default export is a `node:http` request listener,
 * `(req, res, next?)`, that renders pages with a template loader from
 * `createTemplateLoader()`, given that same `req`: the dev template is left on
 * it. `createNodeHandler()` returns one; so does an Express app.
 */
export function angularStreamNode(options: AngularStreamNodeOptions = {}): Plugin {
  const entry = options.entry ?? 'src/server.ts';
  const template = options.template ?? 'index.html';
  const isRoute = routeMatcher(options.routes ?? []);

  return {
    name: PLUGIN_NAME,
    apply: 'serve',
    // Its page middleware has to run before ngp's.
    enforce: 'pre',
    configResolved(config) {
      const names = config.plugins.map((plugin) => plugin.name);
      const own = names.indexOf(PLUGIN_NAME);
      const ngp = names.indexOf(NGP_PLUGIN_NAME);
      if (ngp !== -1 && ngp < own) {
        throw new Error(
          `[${PLUGIN_NAME}] list angularStreamNode() before ngp() in the Vite plugins. ` +
            "After it, ngp's dev SSR answers page requests first, and calls the server entry's " +
            'default export as (url, document) instead of (req, res, next).',
        );
      }
    },
    configureServer(server) {
      /** Requests handed to the server entry. One it passes on to `next` is Vite's to answer. */
      const forwarded = new WeakSet<IncomingMessage>();

      const fail = (next: Next) => (error: unknown) => {
        if (error instanceof Error) {
          server.ssrFixStacktrace(error);
        }
        next(error);
      };

      /** `index.html` as the dev server transforms it for this request. */
      const devTemplate = async (req: DevRequest): Promise<string> => {
        const raw = await readFile(path.join(server.config.root, template), 'utf8');
        return server.transformIndexHtml(req.originalUrl ?? req.url ?? '/', raw, req.originalUrl);
      };

      /**
       * Calls the server entry's default export with the request, and the dev
       * template on it: the template itself, or a function that reads it when
       * the app renders a page after all.
       */
      const callEntry = async (
        req: DevRequest,
        res: ServerResponse,
        next: Next,
        html: string | (() => Promise<string>),
      ): Promise<void> => {
        const environment = server.environments['ssr'];
        if (environment === undefined || !('runner' in environment)) {
          throw new Error(`[${PLUGIN_NAME}] the ssr environment has no module runner`);
        }
        const { runner } = environment as RunnableDevEnvironment;
        const module = (await runner.import(entry)) as { default?: unknown };
        if (typeof module.default !== 'function') {
          throw new Error(
            `[${PLUGIN_NAME}] ${entry} must default-export a request listener, (req, res, next?), such as the handler createNodeHandler() returns`,
          );
        }

        Object.assign(req, { [DEV_TEMPLATE]: html });
        forwarded.add(req);
        (module.default as NodeHandler)(req, res, fail(next));
      };

      // `routes`: before Vite's own middleware, which would answer them itself,
      // with `index.html` for most of them.
      server.middlewares.use((req: DevRequest, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        if (!isRoute(pathname, req)) {
          next();
          return;
        }
        // Read only if the app renders the request as a page, which needs it.
        let html: Promise<string> | undefined;
        callEntry(req, res, next, () => (html ??= devTemplate(req))).catch(fail(next));
      });

      // Returned: runs after Vite's own middlewares, once the HTML fallback has
      // rewritten a page request to `/index.html`.
      return () => {
        server.middlewares.use((req: DevRequest, res, next) => {
          const accept = req.headers.accept ?? '';
          const pathname = (req.url ?? '').split('?')[0] ?? '';
          if (
            (req.method !== 'GET' && req.method !== 'HEAD') ||
            !pathname.endsWith('.html') ||
            !accept.includes('text/html')
          ) {
            next();
            return;
          }
          // A route the app passed on, rewritten to `/index.html` by Vite's
          // HTML fallback. Nothing after the app answers it in production, so
          // it's a 404 here too, rather than going on to ngp's own dev SSR.
          if (forwarded.has(req)) {
            res.statusCode = 404;
            res.end();
            return;
          }

          devTemplate(req)
            .then((html) => callEntry(req, res, next, html))
            .catch(fail(next));
        });
      };
    },
  };
}

/** Whether a path is one of `routes`: a prefix, or what the function says. */
function routeMatcher(
  routes: NonNullable<AngularStreamNodeOptions['routes']>,
): (pathname: string, req: IncomingMessage) => boolean {
  if (typeof routes === 'function') {
    return routes;
  }
  const prefixes = routes.map((route) => {
    if (!route.startsWith('/')) {
      throw new Error(`[${PLUGIN_NAME}] routes are paths that start with "/": "${route}" isn't`);
    }
    const prefix = route.replace(/\/+$/, '');
    if (prefix === '') {
      throw new Error(
        `[${PLUGIN_NAME}] routes can't include "/": it would send every request, Vite's own included, to the app`,
      );
    }
    return prefix;
  });
  return (pathname) =>
    prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
