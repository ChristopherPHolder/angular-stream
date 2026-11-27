import { angularStreamNode } from '@push-based/angular-stream-node/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Plugin, defineConfig, isRunnableDevEnvironment, lazyPlugins } from 'vite-plus';

/** What src/server.ts default-exports: the Express app. */
type App = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

/**
 * `vite dev`: requests under `/api` go to the Express app too. The Node
 * plugin only sends it pages, and Vite would answer these with index.html.
 */
function api(entry: string): Plugin {
  return {
    name: 'example-express-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0];
        if (path !== '/api' && !path?.startsWith('/api/')) {
          next();
          return;
        }
        const ssr = server.environments['ssr'];
        if (ssr === undefined || !isRunnableDevEnvironment(ssr)) {
          next(new Error('the ssr environment has no module runner'));
          return;
        }
        ssr.runner.import<{ default: App }>(entry).then(
          (module) => module.default(req, res, next),
          (error: unknown) => next(error),
        );
      });
    },
  };
}

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    api('src/server.ts'),
    angularStreamNode({ entry: 'src/server.ts' }),
    ngp({ ssr: { entry: 'src/server.ts' } }),
  ]),
});
