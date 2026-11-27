This is the setup both apps in the repository use: Angular compiled by ngp
through Vite, the server bundle running directly in workerd, static assets
served by Cloudflare's `ASSETS` binding, and every navigation falling through
to the rendering Worker.

## 1. The browser config

<!-- include ../_shared/browser-config.md -->

## 2. The server config

<!-- include ../_shared/server-config.md -->

## 3. The Worker

```ts title="src/worker.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

export default createStreamingWorker({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

`allowedHosts` must list every hostname the Worker answers for: Angular's SSR
host guard rejects any other `host` header, and the Worker answers `403`.

`eventDispatchContract` is for `withEventReplay()`. The Worker renders into the
built `index.html`, which doesn't carry the script Angular needs to queue the
clicks made before the page hydrates, so the Worker adds it. Leave it out and
those clicks are lost; the Worker logs a warning when that happens.

## 4. Wrangler

```jsonc title="wrangler.jsonc"
{
  "name": "my-app",
  "main": "./src/worker.ts",
  "compatibility_date": "2026-09-07",
  "assets": {
    "binding": "ASSETS",
    "html_handling": "none",
  },
}
```

`html_handling: "none"` makes the asset server match exact file paths only.
`/assets/*` and `/favicon.ico` are served directly, and every navigation falls
through to the Worker, which fetches `/index.html` through `ASSETS` and renders
the route into it. `index.html` is the template, not the page.

## 5. Vite

```ts title="vite.config.ts"
import { cloudflare } from '@cloudflare/vite-plugin';
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    ngp({ entries: ['src/main.ts', 'src/worker.ts'] }),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ],
});
```

The Cloudflare plugin owns the `ssr` environment and runs it in workerd, so
ngp's own `ssr` option stays off. ngp still compiles the Worker with its server
compiler. In `vite dev` the `ASSETS` binding is backed by the dev server, so the
template already carries Vite's transforms and SSR behaves as it does in
production.

## 6. Build and deploy

```bash
vite build       # client to dist/client, Worker to dist/ssr
wrangler deploy  # deploys the built Worker
```

`vite build` writes `dist/ssr/wrangler.json` and points wrangler at it through
`.wrangler/deploy/config.json`, so `wrangler deploy` ships the built Worker
rather than `wrangler.jsonc`, whose `main` is TypeScript source.

## 7. Stream something

<!-- include ../_shared/stream-something.md -->
