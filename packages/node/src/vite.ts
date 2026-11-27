import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
// Types only: an app that uses this plugin has Vite.
import type { Plugin, RunnableDevEnvironment } from 'vite';
import type { NodeHandler } from './handler';

/**
 * `DEV_TEMPLATE` in `./template`, restated: this module imports nothing of the
 * package at runtime, so Vite's config loader can load it from source.
 */
const DEV_TEMPLATE = Symbol.for('@push-based/angular-stream-node:template');

export interface AngularStreamNodeOptions {
  /**
   * The server entry, relative to Vite's root. Its default export is the
   * handler `createNodeHandler()` returned. Default: `src/server.ts`.
   */
  entry?: string;
  /** The template, relative to Vite's root. Default: `index.html`. */
  template?: string;
}

/**
 * Streams pages in `vite dev` through the app's own handler.
 *
 * Each page request loads the server entry in Vite's `ssr` environment and
 * calls its default export, the handler `createNodeHandler()` returned, with
 * `index.html` as the dev server transforms it: the template carries Vite's
 * client and the app's entry as source, the way the `ASSETS` binding gives a
 * Worker in dev. Static files and modules are left to Vite.
 *
 * List it before ngp, whose own SSR middleware would otherwise answer page
 * requests with a page rendered all at once.
 */
export function angularStreamNode(options: AngularStreamNodeOptions = {}): Plugin {
  const entry = options.entry ?? 'src/server.ts';
  const template = options.template ?? 'index.html';

  return {
    name: 'angular-stream-node',
    apply: 'serve',
    // Its page middleware has to run before ngp's.
    enforce: 'pre',
    configureServer(server) {
      // Returned: runs after Vite's own middlewares, once the HTML fallback has
      // rewritten a page request to `/index.html`.
      return () => {
        server.middlewares.use((req: IncomingMessage & { originalUrl?: string }, res, next) => {
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

          const url = req.originalUrl ?? req.url ?? '/';
          void (async () => {
            const environment = server.environments['ssr'];
            if (environment === undefined || !('runner' in environment)) {
              throw new Error('[angular-stream-node] the ssr environment has no module runner');
            }
            const { runner } = environment as RunnableDevEnvironment;
            const raw = await readFile(path.join(server.config.root, template), 'utf8');
            const html = await server.transformIndexHtml(url, raw, req.originalUrl);
            const module = (await runner.import(entry)) as { default?: unknown };
            if (typeof module.default !== 'function') {
              throw new Error(
                `[angular-stream-node] ${entry} must default-export the handler createNodeHandler() returns`,
              );
            }

            Object.assign(req, { [DEV_TEMPLATE]: html });
            (module.default as NodeHandler)(req, res, (error) => {
              if (error instanceof Error) {
                server.ssrFixStacktrace(error);
              }
              next(error);
            });
          })().catch((error: unknown) => {
            if (error instanceof Error) {
              server.ssrFixStacktrace(error);
            }
            next(error);
          });
        });
      };
    },
  };
}
