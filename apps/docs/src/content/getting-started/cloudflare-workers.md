This is the setup both apps in the repository use: Angular compiled by ngp
through Vite, the server bundle running directly in workerd, static assets
served by Cloudflare's `ASSETS` binding, and every navigation falling through
to the rendering Worker.

## Before you start

<!-- include ../_shared/before-you-start.md -->

## 1. Install

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-cloudflare@next
npm install -D @cloudflare/vite-plugin wrangler
```

## 2. The browser config

<!-- include ../_shared/browser-config.md -->

## 3. The server config

<!-- include ../_shared/server-config.md -->

## 4. The Worker

```ts title="src/worker.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-ssr-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

export default createStreamingWorker({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

<!-- include ../_shared/allowed-hosts.md -->

<!-- include ../_shared/event-replay.md -->

The Worker fetches that `index.html` through the `ASSETS` binding.

## 5. Wrangler

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

## 6. Vite

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
compiler.

## 7. Develop

```bash
vite dev   # http://localhost:5173
```

The Worker runs in workerd, and the `ASSETS` binding is backed by the dev
server, so the template already carries Vite's transforms and pages stream as
they do in production.

## 8. Build and deploy

```bash
vite build       # client to dist/client, Worker to dist/ssr
vite preview     # the built Worker in workerd, http://localhost:4173
wrangler deploy  # deploys the built Worker
```

`vite build` writes `dist/ssr/wrangler.json` and points wrangler at it through
`.wrangler/deploy/config.json`, so `wrangler deploy` ships the built Worker
rather than `wrangler.jsonc`, whose `main` is TypeScript source.

## 9. Check that it streams

With `vite preview` running:

<!-- include ../_shared/check-it-streams.md url=http://localhost:4173/ -->

After the deploy, run the same command against the Worker's address.

## 10. Stream something

<!-- include ../_shared/stream-something.md -->
