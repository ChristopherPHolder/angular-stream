import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type AngularStreamNodeOptions,
  angularStreamNode,
} from '@push-based/angular-stream-node/vite';
// Types only: an app that uses this plugin has Vite.
import type { Plugin, RunnableDevEnvironment } from 'vite';

export type AngularStreamNestOptions = AngularStreamNodeOptions;

type Listener = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * Serves the Nest app in `vite dev`: pages and every other request Vite
 * doesn't answer itself, such as the API.
 *
 * It is `angularStreamNode()` from `@push-based/angular-stream-node/vite`,
 * which streams each page through the server entry's default export with the
 * dev template, plus a middleware after it that hands that same export every
 * request Vite has no file or module for. Without it, `vite dev` answers
 * `/api/...` with its own 404.
 *
 * The server entry's default export is the listener `createRequestListener()`
 * returns. List the plugin before ngp.
 */
export function angularStreamNest(options: AngularStreamNestOptions = {}): Plugin[] {
  const entry = options.entry ?? 'src/server.ts';

  return [
    angularStreamNode(options),
    {
      name: 'angular-stream-nestjs',
      apply: 'serve',
      // After angularStreamNode()'s page middleware, before ngp's.
      enforce: 'pre',
      configureServer(server) {
        // Returned: runs after Vite's own middlewares, so modules, files in
        // `public/` and pages are answered before a request gets here.
        return () => {
          server.middlewares.use((req, res, next) => {
            void (async () => {
              const environment = server.environments['ssr'];
              if (environment === undefined || !('runner' in environment)) {
                throw new Error('[angular-stream-nestjs] the ssr environment has no module runner');
              }
              const { runner } = environment as RunnableDevEnvironment;
              const module = (await runner.import(entry)) as { default?: unknown };
              if (typeof module.default !== 'function') {
                throw new Error(
                  `[angular-stream-nestjs] ${entry} must default-export a request listener, (req, res, next?), such as the one createRequestListener() returns`,
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
