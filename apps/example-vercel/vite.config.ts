import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ngp } from '@push-based/vite-plugin-ngp';
import { type Plugin, defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig(({ command }) => ({
  optimizeDeps: { entries: ['index.html'] },
  environments: {
    // One bundle the function loads without node_modules, and no copy of `public/`.
    ssr: { resolve: { noExternal: true }, build: { copyPublicDir: false } },
  },
  plugins: lazyPlugins(() => [
    ngp({
      entries: ['src/main.ts', 'src/function.ts'],
      // Only the build renders on the server; `vite dev` serves the app client-side.
      ssr: command === 'build' && { entry: 'src/function.ts' },
    }),
    vercelBuildOutput(),
  ]),
}));

/**
 * Builds the browser bundle, then the server bundle, and writes both to
 * `.vercel/output` the way Vercel's Build Output API expects: the browser
 * build as static files, minus `index.html`, and the server build as one
 * Node.js function that every other path is routed to.
 */
function vercelBuildOutput(): Plugin {
  return {
    name: 'vercel-build-output',
    apply: 'build',
    buildApp: {
      order: 'post',
      async handler(builder) {
        const { client, ssr } = builder.environments;
        await builder.build(client!);
        await builder.build(ssr!);

        const { root } = builder.config;
        const clientDir = path.resolve(root, client!.config.build.outDir);
        const serverDir = path.resolve(root, ssr!.config.build.outDir);
        const output = path.resolve(root, '.vercel/output');
        const fn = path.join(output, 'functions/index.func');

        await rm(output, { recursive: true, force: true });
        // `index.html` is the template, not a page. Left out, `/` reaches the function.
        await cp(clientDir, path.join(output, 'static'), {
          recursive: true,
          filter: (file) => file !== path.join(clientDir, 'index.html'),
        });
        // The bundle, and the template next to it: `index.server.html`.
        await mkdir(fn, { recursive: true });
        await cp(serverDir, fn, { recursive: true });
        await writeFile(path.join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(
          path.join(fn, '.vc-config.json'),
          JSON.stringify({
            runtime: 'nodejs26.x',
            handler: 'function.js',
            launcherType: 'Nodejs',
            supportsResponseStreaming: true,
          }),
        );
        // Files first, then everything else to the function, `/` included.
        await writeFile(
          path.join(output, 'config.json'),
          JSON.stringify({
            version: 3,
            routes: [
              { handle: 'filesystem' },
              // A hashed file that no longer exists (an old chunk after a deploy) is a 404, not a page.
              { src: '/assets/(.*)', status: 404 },
              { src: '/(.*)', dest: '/index' },
            ],
          }),
        );
      },
    },
  };
}
