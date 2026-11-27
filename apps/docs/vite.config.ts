import { fileURLToPath } from 'node:url';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig, lazyPlugins } from 'vite-plus';
import { markdown } from './markdown';
import { pressKit } from './press-kit';

const contentDir = fileURLToPath(new URL('./src/content', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const pressKitDir = fileURLToPath(new URL('../../press-kit', import.meta.url));

/**
 * The docs: Angular, server-rendered by ngp, then prerendered to static HTML
 * (`scripts/prerender.ts`) for GitHub Pages. `DOCS_BASE` is the path the site
 * is served under; the Pages workflow sets it to `/angular-stream/`.
 */
export default defineConfig({
  base: process.env['DOCS_BASE'] ?? '/',
  optimizeDeps: { entries: ['index.html'] },
  plugins: lazyPlugins(() => [
    markdown({
      contentDir,
      repoRoot: repoRoot.replace(/\/$/, ''),
      repoBlobUrl: 'https://github.com/push-based/angular-stream/blob/main',
    }),
    pressKit(pressKitDir),
    ngp({
      ssr: true,
      budgets: [
        { type: 'initial', maximumWarning: '400kB', maximumError: '600kB' },
        { type: 'anyComponentStyle', maximumWarning: '4kB', maximumError: '8kB' },
      ],
    }),
  ]),
});
