import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

/**
 * Vite builds both halves, and Bun only runs the result: the browser bundle
 * to dist/client and the server, `src/server.ts` with everything it imports,
 * to dist/server/server.js.
 */
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  // `vite build` builds every environment, not only the client.
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      // Everything in one file, so dist/ is all a server needs: no node_modules.
      resolve: { noExternal: true },
      build: { outDir: 'dist/server', rolldownOptions: { input: 'src/server.ts' } },
    },
  },
  plugins: lazyPlugins(() => [ngp({ entries: ['src/main.ts', 'src/server.ts'] })]),
});
