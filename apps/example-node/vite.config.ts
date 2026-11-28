import { angularStreamNode } from '@push-based/angular-ssr-stream-node/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    angularStreamNode({ entry: 'src/server.ts' }),
    ngp({ ssr: { entry: 'src/server.ts' } }),
  ]),
});
