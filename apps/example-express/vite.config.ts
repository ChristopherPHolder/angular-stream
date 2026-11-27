import { angularStreamNode } from '@push-based/angular-stream-node/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    // `routes`: in `vite dev`, the API goes to the Express app as well as the pages.
    angularStreamNode({ entry: 'src/server.ts', routes: ['/api'] }),
    ngp({ ssr: { entry: 'src/server.ts' } }),
  ]),
});
