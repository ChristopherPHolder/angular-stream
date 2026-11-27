import { defineConfig } from 'vite-plus';

// `vp pack` builds the published package; see packages/core/vite.config.ts.
export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts' },
    platform: 'node',
    // `.js`, not `.mjs`: the names `publishConfig.exports` points at.
    fixedExtension: false,
    dts: true,
    sourcemap: true,
  },
});
