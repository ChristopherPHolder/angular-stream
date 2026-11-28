import { defineConfig } from 'vite-plus';

// `vp pack` builds the published package; see packages/core/vite.config.ts.
// Two entries, because they end up in two different server bundles of an
// Angular CLI app: `index` in server.ts's, `renderer` in main.server.ts's.
export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts', renderer: 'src/renderer.ts' },
    platform: 'neutral',
    dts: true,
    sourcemap: true,
  },
});
