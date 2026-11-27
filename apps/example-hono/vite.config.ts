import devServer from '@hono/vite-dev-server';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    // `vite build`: the browser app to dist/client, src/server.ts to dist/server.
    ngp({ ssr: { entry: 'src/server.ts' } }),
    // `vite dev`: every request Vite doesn't serve itself goes to the Hono app.
    devServer({ entry: 'src/server.ts', injectClientScript: false }),
  ]),
});
