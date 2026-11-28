import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import {
  type AngularStreamNodeOptions,
  angularStreamNode,
} from '@push-based/angular-ssr-stream-node/vite';
// Types only: an app that uses this plugin has Vite.
import type { Plugin, RunnableDevEnvironment } from 'vite';

export type AngularStreamNestOptions = AngularStreamNodeOptions;

/**
 * Where `@push-based/angular-ssr-stream-node` looks for the dev template on the
 * Node request, restated: this module imports nothing of it at runtime but its
 * Vite plugin.
 */
const DEV_TEMPLATE = Symbol.for('@push-based/angular-ssr-stream-node:template');

type Listener = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * Serves the Nest app in `vite dev`: pages and every other request Vite
 * doesn't answer itself, such as the API.
 *
 * It is `angularStreamNode()` from `@push-based/angular-ssr-stream-node/vite`,
 * which streams each page through the server entry's default export with the
 * dev template, plus a middleware after it that hands that same export every
 * request Vite has no file or module for. Without it, `vite dev` answers
 * `/api/...` with its own 404. A `GET` or `HEAD` gets the dev template there
 * too: `angularStreamNode()` only takes requests that accept HTML, so a page
 * fetched without `Accept: text/html` (curl, `fetch()`) arrives here, and Nest
 * renders it.
 *
 * The server entry's default export is the listener `createRequestListener()`
 * returns. List the plugin before ngp.
 */
export function angularStreamNest(options: AngularStreamNestOptions = {}): Plugin[] {
  const entry = options.entry ?? 'src/server.ts';
  const template = options.template ?? 'index.html';

  return [
    angularStreamNode(options),
    {
      name: 'angular-ssr-stream-nestjs',
      apply: 'serve',
      // After angularStreamNode()'s page middleware, before ngp's.
      enforce: 'pre',
      configureServer(server) {
        // Returned: runs after Vite's own middlewares, so modules, files in
        // `public/` and pages are answered before a request gets here.
        return () => {
          server.middlewares.use((req: IncomingMessage & { originalUrl?: string }, res, next) => {
            void (async () => {
              if (req.method === 'GET' || req.method === 'HEAD') {
                const url = req.originalUrl ?? req.url ?? '/';
                const raw = await readFile(path.join(server.config.root, template), 'utf8');
                const html = await server.transformIndexHtml(url, raw, req.originalUrl);
                Object.assign(req, { [DEV_TEMPLATE]: html });
              }
              const environment = server.environments['ssr'];
              if (environment === undefined || !('runner' in environment)) {
                throw new Error(
                  '[angular-ssr-stream-nestjs] the ssr environment has no module runner',
                );
              }
              const { runner } = environment as RunnableDevEnvironment;
              const module = (await runner.import(entry)) as { default?: unknown };
              if (typeof module.default !== 'function') {
                throw new Error(
                  `[angular-ssr-stream-nestjs] ${entry} must default-export a request listener, (req, res, next?), such as the one createRequestListener() returns`,
                );
              }
              (module.default as Listener)(req, res, (error) => {
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
    },
  ];
}
