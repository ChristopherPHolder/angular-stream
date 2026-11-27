This is the setup `apps/example-vercel` uses: Angular compiled by ngp through
Vite, the server bundle running as one Vercel Function on the Node.js runtime,
static assets served by Vercel, and every navigation routed to the function.
There is no adapter package: the core's `createStreamingHandler()` is already a
web-standard handler, which is what a Vercel Function exports. The Vite build
writes the deployment itself, in the layout of Vercel's
[Build Output API](https://vercel.com/docs/build-output-api).

> [!IMPORTANT]
> This setup has not been deployed yet. It has been built with `vercel build`
> and run locally through Vercel's own Node.js launcher, where it streams; see
> [What has been checked](#what-has-been-checked).

## 1. The browser config

Add the interceptor and the stream's providers next to Angular's hydration:

```ts title="src/app/app.config.ts"
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration(): it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

## 2. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 3. The function

```ts title="src/function.ts"
import { readFile } from 'node:fs/promises';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { App } from './app/app';
import { config } from './app/app.config.server';

const template = readFile(new URL('./index.server.html', import.meta.url), 'utf8');

const handle = createStreamingHandler({
  rootComponent: App,
  config,
  allowedHosts: ['localhost', 'my-app.vercel.app'],
  loadTemplate: async () =>
    new Response(await template, { headers: { 'content-type': 'text/html;charset=utf-8' } }),
});

export default {
  fetch: (request: Request) => handle(request),
};
```

A Vercel Function on the Node.js runtime may export `{ fetch }`, and Vercel
streams the `Response` it returns. Every request method reaches `fetch`.

The template is `index.server.html`, which ngp's `ssr` build writes next to the
server bundle: the built `index.html` with the script `withEventReplay()` needs,
so the handler takes no `eventDispatchContract`. The build below copies it into
the function, and the function reads it once per instance.

`allowedHosts` must list every hostname the function answers for: Angular's SSR
host guard rejects any other `host` header, and the function answers `403`.
Each preview deployment has its own `*.vercel.app` hostname; `'*.vercel.app'`
admits all of them, and the example lists that.

## 4. Vite

```ts title="vite.config.ts"
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ngp } from '@push-based/vite-plugin-ngp';
import { type Plugin, defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  optimizeDeps: { entries: ['index.html'] },
  environments: {
    // One bundle the function loads without node_modules, and no copy of `public/`.
    ssr: { resolve: { noExternal: true }, build: { copyPublicDir: false } },
  },
  plugins: [
    ngp({
      entries: ['src/main.ts', 'src/function.ts'],
      // Only the build renders on the server; `vite dev` serves the app client-side.
      ssr: command === 'build' && { entry: 'src/function.ts' },
    }),
    vercelBuildOutput(),
  ],
}));

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
```

ngp's `ssr` option builds the browser app into `dist/client` and the server
entry into `dist/server`. It is on only for the build: in `vite dev`, ngp would
render pages with a `render(url, document)` export that returns a string, which
a streaming entry doesn't have. `resolve.noExternal: true` bundles every
dependency into the server build, so the function needs no `node_modules`.

The plugin's `buildApp` hook builds both, then writes `.vercel/output`:

| Path                                     | What it holds                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `config.json`                            | The routes: static files first, a 404 for a missing `/assets/` file, every other path to the function. |
| `static/`                                | `dist/client` without `index.html`, served by Vercel's CDN.                                            |
| `functions/index.func/function.js`       | The server bundle, and its chunks in `assets/`.                                                        |
| `functions/index.func/index.server.html` | The template.                                                                                          |
| `functions/index.func/.vc-config.json`   | A Node.js function, with response streaming on.                                                        |

`index.html` stays out of `static/` for the same reason the Cloudflare setup
sets `html_handling: "none"`: it is the template, not a page. If it were there,
Vercel would serve it for `/` before the function ever saw the request.

Add `.vercel/` to `.gitignore`.

## 5. Build and deploy

Create a Vercel project for the app (in a monorepo, set its Root Directory to
the app's folder). Vercel runs the app's `build` script, finds the
`.vercel/output` it wrote and deploys that as it is, so the project needs no
`vercel.json` and no framework preset. From your machine:

```bash
vercel build             # runs the build script; .vercel/output is the result
vercel deploy --prebuilt # uploads .vercel/output
```

`vite dev` serves the app client-side, without a server render, and Angular
logs NG0505 because there is no hydration data. Nothing streams until the build.

## The Edge runtime

Vercel also runs functions on its Edge runtime, and the Angular server bundle
fits there: the example's is about 210 kB gzipped, against
[limits](https://vercel.com/docs/functions/runtimes/edge) of 1 MB (Hobby),
2 MB (Pro) and 4 MB (Enterprise). Built for the Edge runtime and run
in Vercel's local Edge emulation, it streams the same way. It does take three
changes from the setup above:

- No file system: the template has to be part of the bundle (inlined with
  Vite's `define`, or imported as a string), not read from disk.
- `ssr: { target: 'webworker' }` in the Vite config. Built for Node, the bundle
  imports `node:module` to reach the `require()` that Angular's server XHR
  fallback (`xhr2`) uses, and the Edge runtime has no `node:module`.
- An Edge function's `.vc-config.json` is
  `{ "runtime": "edge", "entrypoint": "..." }`. The bundle that was checked was
  a single file (`codeSplitting: false`), with no chunks to load.

[Vercel itself recommends](https://vercel.com/docs/functions/runtimes/edge)
the Node.js runtime over Edge, and the Node.js setup is
the one documented here and used by the example.

## What has been checked

In this repository, with `apps/example-vercel`:

- `vite build`, and `vercel build` with no login, and a hand-written `.vercel/project.json`
  in place of `vercel link`: Vercel
  CLI picked up the `.vercel/output` the build wrote, with or without the Vite
  framework preset.
- The built function, run through `@vercel/node`'s local server (the code that
  wraps a `{ fetch }` export and streams its response on Vercel's Node.js
  runtime), with `static/` served first: `curl -N` shows the shell at once and
  the widget's `<template data-ngs>` chunk 2 s later, and in headless Chrome
  the widget hydrates.
- The Edge variant, run through `@vercel/node`'s Edge emulation: the same
  timings.

Not checked: a real deployment. Vercel's CDN, its compression and its routing
in front of the function have not been seen streaming this app.

## Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
