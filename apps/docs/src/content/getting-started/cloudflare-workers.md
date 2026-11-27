This is the setup both apps in the repository use: Angular compiled by ngp
through Vite, the server bundle running directly in workerd, static assets
served by Cloudflare's `ASSETS` binding, and every navigation falling through
to the rendering Worker.

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

`streamHttpInterceptor` reports each request to the renderer on the server,
and in the browser holds back a request the server is already making until its
response arrives on the stream. `provideStreamHydration()` keeps Angular's
hydration data and block registry in step with the chunks.

## 2. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 3. The Worker

```ts title="src/worker.ts"
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';
import { App } from './app/app';
import { config } from './app/app.config.server';

export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

`allowedHosts` must list every hostname the Worker answers for: Angular's SSR
host guard rejects any other `host` header, and the Worker answers `403`.

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

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
