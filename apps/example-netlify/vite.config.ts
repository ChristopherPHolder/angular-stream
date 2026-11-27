import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ngp } from '@push-based/vite-plugin-ngp';
import {
  type Plugin,
  type ViteDevServer,
  defineConfig,
  isRunnableDevEnvironment,
  lazyPlugins,
} from 'vite-plus';

/**
 * `vp build` builds the browser app into `dist/client`, Netlify's publish
 * directory, then the Netlify Function into `dist/netlify/functions/ssr/`.
 * `vp build --mode edge` builds an Edge Function into
 * `dist/netlify/edge-functions/ssr/` instead. Either is one self-contained
 * module that Netlify deploys as it is.
 */
export default defineConfig(({ command, mode }) => {
  const kind = mode === 'edge' ? 'edge-functions' : 'functions';
  const entry = mode === 'edge' ? 'src/edge-function.ts' : 'src/function.ts';

  return {
    optimizeDeps: { entries: ['index.html'] },
    builder: {},
    environments: {
      client: { build: { outDir: 'dist/client' } },
      ssr: {
        // Netlify doesn't install the app's dependencies for the function. The
        // dev server leaves them to Node, as for any server environment.
        resolve: { noExternal: command === 'build' || undefined },
        build: {
          outDir: `dist/netlify/${kind}/ssr`,
          copyPublicDir: false,
          rolldownOptions: {
            input: { ssr: entry },
            output: { entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
          },
        },
      },
    },
    plugins: lazyPlugins(() => [ngp({ entries: ['src/main.ts', entry] }), netlifyFunction(entry)]),
  };
});

/**
 * The parts of a Netlify deploy that Vite has to do:
 *
 * - `virtual:template` is the page the function renders into. In the build it
 *   is the browser build's `index.html`, which is then deleted from the publish
 *   directory: Netlify would serve it for `/` instead of calling the function.
 *   In dev it is `index.html` as Vite serves it.
 * - The build leaves only one function behind: an Edge Function on `/*` runs
 *   before, and instead of, the Netlify Function.
 * - The dev server hands each page request to the function, through the `ssr`
 *   environment, and streams its `Response` back as it arrives.
 */
function netlifyFunction(entry: string): Plugin {
  let root = '';
  let clientOutDir = '';
  let server: ViteDevServer | undefined;

  return {
    name: 'example-netlify:function',
    configResolved(config) {
      root = config.root;
      clientOutDir = path.resolve(root, config.environments['client']?.build.outDir ?? 'dist');
    },
    resolveId: {
      filter: { id: /^virtual:template$/ },
      handler: (id) => `\0${id}`,
    },
    load: {
      filter: { id: /^\0virtual:template$/ },
      async handler() {
        const html = server
          ? await server.transformIndexHtml(
              '/',
              await readFile(path.join(root, 'index.html'), 'utf8'),
            )
          : await readFile(path.join(clientOutDir, 'index.html'), 'utf8');
        return `export default ${JSON.stringify(html)};`;
      },
    },
    async buildStart() {
      if (this.environment.name === 'ssr') {
        await rm(path.join(root, 'dist/netlify'), { recursive: true, force: true });
      }
    },
    async writeBundle() {
      if (this.environment.name === 'ssr') {
        await rm(path.join(clientOutDir, 'index.html'));
      }
    },
    configureServer(devServer) {
      server = devServer;
      // After Vite's own middlewares, so modules and the files in `public/` are served first.
      return () => {
        devServer.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' || !req.headers.accept?.includes('text/html')) {
            return next();
          }
          void (async () => {
            const environment = devServer.environments['ssr'];
            if (!environment || !isRunnableDevEnvironment(environment)) {
              throw new Error('the ssr environment has no module runner');
            }
            const { default: handle } = await environment.runner.import<{
              default: (request: Request, context: unknown) => Promise<Response>;
            }>(entry);
            const headers = new Headers();
            for (const [name, value] of Object.entries(req.headers)) {
              if (typeof value === 'string') {
                headers.set(name, value);
              }
            }
            const url = new URL(req.originalUrl ?? req.url ?? '/', `http://${req.headers.host}`);
            const response = await handle(new Request(url, { headers }), {});
            res.writeHead(response.status, [...response.headers].flat());
            // Each chunk is written as soon as the function sends it.
            for await (const chunk of response.body ?? []) {
              res.write(chunk);
            }
            res.end();
          })().catch((error: unknown) => {
            if (error instanceof Error) {
              devServer.ssrFixStacktrace(error);
            }
            next(error);
          });
        });
      };
    },
  };
}
