import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// From Vite itself, not Vite+: users of the published package have Vite.
import type { Plugin } from 'vite';
// Adds the `nitro` field (a Nitro module) to Vite's `Plugin`.
import type {} from 'nitro/vite';
import { TEMPLATE_ASSETS, TEMPLATE_KEY } from './template.ts';

/**
 * Puts the app's `index.html` where `defineStreamingHandler()` reads it: a
 * Nitro server-assets directory, `<buildDir>/angular-ssr-stream`.
 *
 * - `vite build`: the client build's `index.html` is taken out of the public
 *   output, so no preset or CDN serves it as a static page, and written to that
 *   directory, from which Nitro bundles it into the server.
 * - `vite dev`: the `index.html` Vite serves, dev transforms included, is
 *   written there whenever it changes.
 *
 * It also makes `index.html` the client build's input, and turns off Nitro's
 * own renderer for it: the handler renders every page.
 *
 * Add it to `plugins` next to `nitro()`.
 */
export function streamingTemplate(): Plugin {
  let dir: string | undefined;
  let root = process.cwd();

  const write = (html: string) => {
    if (dir === undefined) {
      throw new Error('[angular-ssr-stream] streamingTemplate() needs the nitro() Vite plugin.');
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, TEMPLATE_KEY), html);
  };

  return {
    name: 'angular-ssr-stream:nitro-template',
    enforce: 'pre',

    nitro: {
      name: 'angular-ssr-stream:template',
      setup(nitro) {
        dir = join(nitro.options.buildDir, TEMPLATE_ASSETS);
        if (!nitro.options.dev) {
          // A dev template must never end up in a production bundle.
          rmSync(dir, { recursive: true, force: true });
        }
        nitro.options.serverAssets.push({ baseName: TEMPLATE_ASSETS, dir });
      },
    },

    config(config) {
      const client = config.environments?.['client']?.build;
      const input = client?.rollupOptions?.input ?? client?.rolldownOptions?.input;
      return {
        // Nitro would otherwise serve `index.html` itself, as its renderer's template.
        ...(config.nitro?.renderer === undefined && { nitro: { renderer: false } }),
        ...(input === undefined && {
          environments: { client: { build: { rollupOptions: { input: 'index.html' } } } },
        }),
      };
    },

    configResolved(config) {
      root = config.root;
    },

    generateBundle: {
      // After Vite's HTML plugin has emitted the page.
      order: 'post',
      handler(_options, bundle) {
        if (this.environment.config.consumer !== 'client') {
          return;
        }
        const page = bundle[TEMPLATE_KEY];
        if (page?.type !== 'asset') {
          // Without it every page would answer 404 in production, with nothing to say why.
          this.error(
            `[angular-ssr-stream] streamingTemplate(): the client build has no top-level ${TEMPLATE_KEY} to render pages into.`,
          );
        }
        write(String(page.source));
        delete bundle[TEMPLATE_KEY];
      },
    },

    configureServer(server) {
      const file = resolve(root, 'index.html');
      const update = async () =>
        write(await server.transformIndexHtml('/index.html', readFileSync(file, 'utf8')));

      const updateLogged = () =>
        update().catch((error: unknown) => server.config.logger.error(String(error)));

      server.watcher.add(file);
      server.watcher.on('change', (changed) => {
        if (resolve(changed) === file) {
          void updateLogged();
        }
      });
      void updateLogged();
    },
  };
}
