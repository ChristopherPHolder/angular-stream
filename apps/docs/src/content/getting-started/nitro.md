Nitro builds one server for many hosts: the same app goes to Node, Bun, Deno,
Vercel, Netlify, Cloudflare and the rest of
[Nitro's presets](https://nitro.build/deploy) by changing one setting. This is
the setup `apps/example-nitro` uses: Angular compiled by ngp through Vite,
Nitro's Vite plugin building the server, static files served by Nitro or the
host's CDN, and every other request rendered by the streaming handler.

It needs Nitro 3, whose Vite plugin is what builds the server here. Nitro 3 is a release candidate. Nitro numbers its release candidates by date (`3.0.261103-rc`), and no version range can follow them, so the package asks for exactly the one it was checked with, and moves with each new one. `unstorage` 2, which Nitro's storage needs, is still a beta. For a
single host that has its own adapter, such as
[Cloudflare Workers](cloudflare-workers.md), that adapter is lighter.

## 1. Install

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-nitro@next unstorage
npm install -D nitro@3.0.261103-rc
```

`unstorage` is what Nitro reads server assets through; the handler reads the
template that way.

## 2. The browser config

<!-- include ../_shared/browser-config.md -->

## 3. The server config

<!-- include ../_shared/server-config.md -->

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
Nitro's server ignores `X-Forwarded-Host` and `X-Forwarded-Proto` unless its
`trustProxy` option is on, so behind a proxy the check sees the `host` header
the proxy sends. List preview hostnames too, with a wildcard such as
`*.vercel.app`.

A missing file under `/assets/` answers `404`; any other path that isn't a
file, `/nope.png` included, is rendered as a page.

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
  `awsLambda: { streaming: true }` switches to `streamifyResponse`, which
  streams through a Lambda Function URL, or through an API Gateway REST API
  with [response streaming](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode-lambda.html).
- `azure_swa` (Azure Static Web Apps) reads the body whole with Functions v3,
  and with v4 hands it to Azure Functions without turning on
  [`enableHttpStream`](https://learn.microsoft.com/en-us/azure/azure-functions/node-http-stream).

## Nitro or srvx?

[srvx](https://srvx.h3.dev), from the same ecosystem, is a `fetch`-style server
for Node, Bun and Deno, and it is what Nitro's `node-server`, `bun` and
`deno_server` presets run on. On those three runtimes it would stream the same
way with less in between. What it doesn't give you is the build: it has no
presets and no Vite plugin, so serving the client build, loading the template
and bundling the server would be yours to wire up. Use Nitro to reach the hosts
it has presets for, and a dedicated adapter where one host matters on its own.

## Stream something

<!-- include ../_shared/stream-something.md -->
