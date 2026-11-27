import { defineConfig } from 'vite-plus';

// `vp pack` builds the published package; see packages/core/vite.config.ts.
export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts' },
    platform: 'neutral',
    dts: true,
    sourcemap: true,
  },
});
