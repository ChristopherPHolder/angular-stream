import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  // `vp build` builds both: the browser app, then the server bundle.
  builder: {},
  // Compute's engine is closer to a web worker than to Node: resolve the
  // server's dependencies to their browser builds, all bundled into one file.
  ssr: { target: 'webworker', noExternal: true },
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      build: {
        outDir: 'dist/server',
        ssr: 'src/server.ts',
        copyPublicDir: false,
        rollupOptions: {
          // The Compute APIs, provided by `js-compute-runtime` when it compiles the bundle.
          external: [/^fastly:/],
          output: { codeSplitting: false },
        },
      },
    },
  },
  plugins: lazyPlugins(() => [ngp({ entries: ['src/main.ts', 'src/server.ts'] })]),
});
