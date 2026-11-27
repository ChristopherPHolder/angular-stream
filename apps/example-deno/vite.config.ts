import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  environments: {
    ssr: {
      // One self-contained server bundle: Deno runs it with no node_modules and no import map.
      resolve: { noExternal: true },
      // The bundle is Deno's main module, so `import.meta.main` would be true in every module in it,
      // and `@std/http/file-server` would start its own file server on the working directory.
      define: { 'import.meta.main': 'false' },
      build: { copyPublicDir: false },
    },
  },
  plugins: lazyPlugins(() => [ngp({ ssr: { entry: 'src/server.ts' } })]),
});
