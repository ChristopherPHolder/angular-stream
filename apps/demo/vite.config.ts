import { cloudflare } from '@cloudflare/vite-plugin';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    ngp({
      entries: ['src/main.ts', 'src/worker.ts'],
      budgets: [
        { type: 'initial', maximumWarning: '500kB', maximumError: '1MB' },
        { type: 'anyComponentStyle', maximumWarning: '4kB', maximumError: '8kB' },
      ],
    }),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ]),
});
