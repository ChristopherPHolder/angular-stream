import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

/**
 * `vite build` builds the browser app into dist/client and the function into
 * dist/server/ssr.js, the `main` of package.json. The function bundles
 * everything except `@azure/functions`, which has to be the copy the Functions
 * worker loads.
 */
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      resolve: { noExternal: true, external: ['@azure/functions'] },
      build: {
        outDir: 'dist/server',
        copyPublicDir: false,
        rolldownOptions: { input: { ssr: 'src/functions/ssr.ts' } },
      },
    },
  },
  plugins: lazyPlugins(() => [ngp({ entries: ['src/main.ts', 'src/functions/ssr.ts'] })]),
});
