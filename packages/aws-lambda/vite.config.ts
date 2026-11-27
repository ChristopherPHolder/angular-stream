import { defineConfig } from 'vite-plus';

// `vp pack` builds the published package; see packages/core/vite.config.ts.
// Lambda runs Node.js, so `node:` imports stay as they are.
export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts' },
    platform: 'node',
    fixedExtension: false,
    dts: true,
    sourcemap: true,
  },
});
