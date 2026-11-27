import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

/**
 * Two builds: the browser app into `dist/client`, and the Lambda handler into
 * `dist/server/lambda.mjs`, one ES module with every dependency bundled in,
 * since the deployment package has no `node_modules`.
 */
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  builder: {},
  environments: {
    client: {
      build: { outDir: 'dist/client' },
    },
    ssr: {
      resolve: { noExternal: true },
      build: {
        outDir: 'dist/server',
        copyPublicDir: false,
        target: 'node24',
        rollupOptions: {
          input: { lambda: 'src/lambda.ts' },
          output: { entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
        },
      },
    },
  },
  plugins: lazyPlugins(() => [ngp({ entries: ['src/main.ts', 'src/lambda.ts'] })]),
});
