import { cloudflare } from '@cloudflare/vite-plugin';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    ngp({ entries: ['src/main.ts', 'src/worker.ts'] }),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ]),
});
