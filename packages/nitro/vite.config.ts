import { defineConfig } from 'vite-plus';

// `vp pack` builds the published package; see packages/core/vite.config.ts.
export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts', vite: 'src/vite.ts' },
    platform: 'neutral',
    // Only the Vite plugin uses them, and it runs in Node.
    deps: { neverBundle: [/^node:/] },
    dts: true,
    sourcemap: true,
  },
});
