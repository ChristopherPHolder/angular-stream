import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { ngp } from '@push-based/vite-plugin-ngp';
import { type Plugin, defineConfig, lazyPlugins } from 'vite-plus';

const OUT_DIR = 'dist';
const WORKER_FILE = 'sw.js';
const PRECACHE_MODULE = 'virtual:precache';

/**
 * `virtual:precache`: the client build's files, for the Service Worker to cache
 * on install. The client is built first and its output is read from disk. The
 * files' hash names the cache and changes the worker's bytes, so every build
 * installs a new worker.
 */
function precache(): Plugin {
  return {
    name: 'example-service-worker:precache',
    resolveId(id) {
      return id === PRECACHE_MODULE ? `\0${PRECACHE_MODULE}` : undefined;
    },
    load(id) {
      if (id !== `\0${PRECACHE_MODULE}`) {
        return undefined;
      }

      const files = readdirSync(OUT_DIR, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => `${entry.parentPath}/${entry.name}`.slice(OUT_DIR.length))
        .filter((file) => file !== `/${WORKER_FILE}` && !file.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const file of files) {
        hash.update(file).update(readFileSync(`${OUT_DIR}${file}`));
      }

      return [
        `export const files = ${JSON.stringify(files)};`,
        `export const version = ${JSON.stringify(hash.digest('hex').slice(0, 12))};`,
      ].join('\n');
    },
  };
}

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  build: { outDir: OUT_DIR },
  builder: {
    // The worker caches what the client build wrote, so the client goes first.
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.worker);
    },
  },
  environments: {
    // The Service Worker: Angular's server renderer and the app, in one classic script.
    worker: {
      consumer: 'server',
      resolve: {
        conditions: ['worker', 'browser', 'module', 'default'],
        noExternal: true,
      },
      build: {
        outDir: OUT_DIR,
        emptyOutDir: false,
        copyPublicDir: false,
        minify: true,
        rolldownOptions: {
          input: 'src/service-worker.ts',
          output: { format: 'iife', entryFileNames: WORKER_FILE },
        },
      },
    },
  },
  plugins: lazyPlugins(() => [
    ngp({ entries: ['src/main.ts', 'src/service-worker.ts'] }),
    precache(),
  ]),
});
