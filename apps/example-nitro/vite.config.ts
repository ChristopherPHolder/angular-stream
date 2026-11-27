import { streamingTemplate } from '@push-based/angular-stream-nitro/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { nitro } from 'nitro/vite';
import { defineConfig, lazyPlugins } from 'vite-plus';

// The preset comes from NITRO_PRESET, or from the host Nitro detects at build
// time; locally it is `node-server`.
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    ngp({ entries: ['src/main.ts', 'src/server.ts'] }),
    streamingTemplate(),
    nitro({ serverEntry: './src/server.ts', compatibilityDate: '2026-11-01' }),
  ]),
});
