import { defineConfig } from 'vite-plus';

// `vp pack` builds the published package. In this repo the apps import the
// TypeScript source instead (see `exports` in package.json); `publishConfig`
// swaps in `dist/` when the package is packed.
export default defineConfig({
  pack: {
    entry: { index: 'src/client/index.ts', server: 'src/server/index.ts' },
    platform: 'neutral',
    dts: true,
    sourcemap: true,
  },
});
