Nitro builds one server for many hosts: the same app goes to Node, Bun, Deno,
Vercel, Netlify, Cloudflare and the rest of
[Nitro's presets](https://nitro.build/deploy) by changing one setting. This is
the setup `apps/example-nitro` uses: Angular compiled by ngp through Vite,
Nitro's Vite plugin building the server, static files served by Nitro or the
host's CDN, and every other request rendered by the streaming handler.

It needs Nitro 3, whose Vite plugin is what builds the server here. For a
single host that has its own adapter, such as
[Cloudflare Workers](cloudflare-workers.md), that adapter is lighter.

## 1. Install

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-nitro@next unstorage
npm install -D nitro
```

`unstorage` is what Nitro reads server assets through; the handler reads the
template that way.

## 2. The browser config

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

This is the same config as on any other runtime; see
[Cloudflare Workers](cloudflare-workers.md#1-the-browser-config) for what each
provider does.

## 3. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 4. The handler

```ts title="src/server.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { defineStreamingHandler } from '@push-based/angular-stream-nitro';
import { App } from './app/app';
import { config } from './app/app.config.server';

export default defineStreamingHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.vercel.app'],
});
```

This file is Nitro's server entry: Nitro serves a static file when there is
one, runs any routes of its own, and hands every other request to the handler,
which renders the route into the template.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the handler answers `403`.

`eventDispatchContract` is for `withEventReplay()`. The built `index.html`
doesn't carry the script Angular needs to queue the clicks made before the page
hydrates, so the handler adds it.

## 5. Vite

```ts title="vite.config.ts"
import { streamingTemplate } from '@push-based/angular-stream-nitro/vite';
import { ngp } from '@push-based/vite-plugin-ngp';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    ngp({ entries: ['src/main.ts', 'src/server.ts'] }),
    streamingTemplate(),
    nitro({ serverEntry: './src/server.ts', compatibilityDate: '2026-11-01' }),
  ],
});
```

Nitro's plugin owns the server build, in an environment of its own, so ngp's
`ssr` option stays off; ngp still compiles `src/server.ts` and the app it
imports with its server compiler.

`streamingTemplate()` is what makes `index.html` the template rather than a
page. In `vite build` it takes the built `index.html` out of the static output,
so neither Nitro nor a host's CDN serves it for `/`, and hands it to Nitro as a
server asset, which Nitro bundles into the server for every preset. In
`vite dev` it gives the handler the `index.html` Vite serves, with Vite's dev
transforms, so SSR behaves as it does in production.

## 6. Run it

```bash
vite dev                          # http://localhost:3000
vite build                        # node-server preset, to .output/
node .output/server/index.mjs     # http://localhost:3000
```

`vite build` builds the browser app into `.output/public` and the server into
`.output/server`. The `node-server` output is self-contained: copy `.output`
anywhere Node runs. `vite preview` serves it too.

## 7. Deploy with a preset

The preset decides what `vite build` writes. Set it with `NITRO_PRESET`, or
`preset` in the Nitro options:

```bash
NITRO_PRESET=vercel vite build    # .vercel/output, the Build Output API
NITRO_PRESET=netlify vite build   # dist and .netlify/v1/functions
NITRO_PRESET=bun vite build       # bun .output/server/index.mjs
```

On Vercel and Netlify there is nothing to set: Nitro sees it is building there
and picks the preset itself, so a build command of `vite build` is enough.
[Nitro's deploy docs](https://nitro.build/deploy) cover each provider.

## Presets we checked

Each row was built from `apps/example-nitro` with that preset and checked with
`curl -N` and in headless Chrome, two page loads each. It streams when the
shell arrives at once and the widget's chunk about 2 s later, as its fake API
answers.

| Preset              | Run locally with                                     | Shell     | Widget chunk   | Streams |
| ------------------- | ---------------------------------------------------- | --------- | -------------- | ------- |
| `node-server`       | `node .output/server/index.mjs`, and `vite dev`      | 2 ms      | 1 980 ms       | Yes     |
| `vercel`            | `@vercel/node`'s dev server (what `vercel dev` runs) | 2 ms      | 1 975 ms       | Yes     |
| `netlify`           | `netlify dev --offline`                              | 50–140 ms | 2 040–2 130 ms | Yes     |
| `bun`               | `bun .output/server/index.mjs`                       | 2 ms      | 1 985 ms       | Yes     |
| `deno_server`       | `deno run` on `.output/server/index.mjs`             | 2 ms      | 1 985 ms       | Yes     |
| `cloudflare_module` | `wrangler dev` on `.output/server`                   | 2 ms      | 1 980 ms       | Yes     |

None of these was checked on a real deployment, only with each platform's
local runtime. A CDN or proxy in front of the server can still buffer; see
[Debugging and verifying](../guides/debugging.md).

Two presets buffer as Nitro ships them, going by their runtime code (not run):

- `aws_lambda` returns the whole body in one Lambda result. Nitro's
  `awsLambda: { streaming: true }` switches to `streamifyResponse`, which needs
  a Lambda Function URL with response streaming.
- `azure_swa` (Azure Static Web Apps) reads the body whole with Functions v3,
  and with v4 hands it to Azure Functions without turning on
  `enableHttpStream`.

## Nitro or srvx?

[srvx](https://srvx.h3.dev), from the same ecosystem, is a `fetch`-style server
for Node, Bun and Deno, and it is what Nitro's `node-server`, `bun` and
`deno_server` presets run on. On those three runtimes it would stream the same
way with less in between. What it doesn't give you is the build: it has no
presets and no Vite plugin, so serving the client build, loading the template
and bundling the server would be yours to wire up. Use Nitro to reach the hosts
it has presets for, and a dedicated adapter where one host matters on its own.

## Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
