import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

/**
 * `vite build` builds the browser app into dist/client and the function into
 * dist/server/ssr.js, the `main` of package.json. The function bundles
 * everything, `@azure/functions` and its dependencies included, so the deployed
 * app needs no node_modules. Only `@azure/functions-core` stays external: the
 * Functions worker provides it, and there is no package of that name to install.
 */
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      resolve: { noExternal: true, external: ['@azure/functions-core'] },
      build: {
        outDir: 'dist/server',
        copyPublicDir: false,
        rolldownOptions: {
          input: { ssr: 'src/functions/ssr.ts' },
          external: ['@azure/functions-core'],
        },
      },
    },
  },
  plugins: lazyPlugins(() => [ngp({ entries: ['src/main.ts', 'src/functions/ssr.ts'] })]),
});
