Two things decide the setup: how the app is built, the Angular CLI or Vite
with ngp, and where it runs. Both come down to a runtime page; this one has
what they all need.

## Requirements

- **Angular 19.2, 20.3, 21.2 or 22**, from the patch each row of
  [the compatibility table](#compatibility) names, standalone, with
  incremental hydration. Zoneless or with Zone.js.
- **A server that speaks web `Request` and `Response`**, directly or through
  one of the adapters below.
- **A build that compiles Angular for the server**, one of two:
  - **The Angular CLI** (`@angular/build`), with `@angular/ssr` serving the
    app, as `ng new --ssr` sets it up. `@angular/ssr` keeps its server routes,
    render modes and status codes; its server-rendered routes stream. See
    [Angular CLI](angular-cli.md).
  - **Vite with [`@push-based/vite-plugin-ngp`](https://github.com/push-based/vite-plugin-ngp)**,
    which every other runtime page uses, building the server bundle for that
    runtime. ngp needs Node 26 to build, and every `@angular/*` package pinned
    to exactly `22.3.0-rc.0`. `@angular/ssr` is not used on this path, so its
    `AngularAppEngine`, server routes and render modes are not available; see
    [Caveats and limitations](../reference/limitations.md).
- **To run, Node 20 or later** where the server is Node: the Node, Fastify,
  NestJS and AWS Lambda adapters use `Headers.getSetCookie()`. CI runs them on
  Node 26. The other runtimes need what their own platform asks for.
- **For the dev plugins, Vite 7 or later** (`angularStreamNode()`,
  `angularStreamNest()`), and Vite 8 for Nitro's. They are optional peer
  dependencies: a production server doesn't load them.

## Compatibility

The packages use private Angular APIs (the `ɵ`-prefixed ones), which can
change in any release. So the supported versions are the ones a check proves,
not a guess: every row below is built and run in CI, zoneless and with
Zone.js, as an app made by the Angular CLI. The server has to send the shell
before the data and the widget in a chunk after it, with `@angular/ssr`'s
statuses, headers and redirects intact. In Chrome, the widget has to hydrate
from the server's HTML, with Angular's hydration checks on, and answer a
click.

| Angular | From    | Zoneless | Zone.js | What the app needs                                                               |
| ------- | ------- | -------- | ------- | -------------------------------------------------------------------------------- |
| 22      | 22.0.0  | Yes      | Yes     | Nothing extra: incremental hydration is on by default                            |
| 21.2    | 21.2.13 | Yes      | Yes     | `withIncrementalHydration()` in `provideClientHydration()`                       |
| 20.3    | 20.3.21 | Yes      | Yes     | `withIncrementalHydration()` in `provideClientHydration()`                       |
| 19.2    | 19.2.22 | Yes      | Yes     | `withIncrementalHydration()`, and `provideExperimentalZonelessChangeDetection()` |

Not supported:

- **Angular 18 and older**, which have no incremental hydration.
- **19.0, 19.1, 20.0 to 20.2, 21.0 and 21.1, and the patches below each row's
  "From".** They lack two security fixes Angular backported only to the last
  minor of each major: the server's host check (`ɵisHostAllowed`), and passing
  the server platform to `bootstrapApplication()`, which the renderer
  bootstraps through.

With incremental hydration off, the server renders no `@defer` block with a
`hydrate` trigger, so nothing streams. In development the server says so in a
warning.

The ngp setups are the exception: ngp builds exactly `22.3.0-rc.0`, and no
other version.

The matrix is in `.github/workflows/compat.yml` and runs
[`compat/run.mjs`](https://github.com/push-based/angular-ssr-stream/blob/main/compat/run.mjs)
for each row, on every pull request that touches the packages, and every week
against Angular's `next` too. A new Angular minor gets a row there first, and
joins the peer ranges once it passes.

## Install

No release is out yet: until the first one, the packages are only available as
source in [the repository](https://github.com/push-based/angular-ssr-stream),
where the apps use them. Releases will go to npm's `next` dist-tag while ngp
pins Angular to a release candidate, which is why every command on these pages
installs `@next`:

```bash
npm install @push-based/angular-ssr-stream-core@next
```

Then the adapter for where it runs, if it has one. A runtime that hands the
server a web `Request` and takes a `Response` back needs no adapter: the
core's `createStreamingHandler()` is the whole server, and its page shows the
few lines around it.

| Where it runs                                   | Package                                      | Setup                                         |
| ----------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| Angular CLI, with `@angular/ssr`                | `@push-based/angular-ssr-stream-angular-ssr` | [Angular CLI](angular-cli.md)                 |
| Node (`node:http`, Connect)                     | `@push-based/angular-ssr-stream-node`        | [Node](node.md)                               |
| Express                                         | `@push-based/angular-ssr-stream-node`        | [Express](express.md)                         |
| Fastify                                         | `@push-based/angular-ssr-stream-fastify`     | [Fastify](fastify.md)                         |
| NestJS (on Express or Fastify)                  | `@push-based/angular-ssr-stream-nestjs`      | [NestJS](nestjs.md)                           |
| Koa                                             | `@push-based/angular-ssr-stream-node`        | [Koa](koa.md)                                 |
| Cloudflare Workers                              | `@push-based/angular-ssr-stream-cloudflare`  | [Cloudflare Workers](cloudflare-workers.md)   |
| Hono (Node, Bun, Deno, Workers)                 | none                                         | [Hono](hono.md)                               |
| Deno, Deno Deploy                               | none                                         | [Deno](deno.md)                               |
| Bun                                             | none                                         | [Bun](bun.md)                                 |
| Fastly Compute                                  | none                                         | [Fastly Compute](fastly-compute.md)           |
| Vercel                                          | none                                         | [Vercel](vercel.md)                           |
| Netlify                                         | none                                         | [Netlify](netlify.md)                         |
| AWS Lambda                                      | `@push-based/angular-ssr-stream-aws-lambda`  | [AWS Lambda](aws-lambda.md)                   |
| Azure Functions                                 | none                                         | [Azure Functions](azure-functions.md)         |
| Nitro, and the hosts its presets deploy to      | `@push-based/angular-ssr-stream-nitro`       | [Nitro](nitro.md)                             |
| A Service Worker, in the browser (experimental) | none                                         | [Service Worker](../guides/service-worker.md) |

Every package is released together, with one version: install the same
version of each.

The packages ship ESM and type declarations, and carry no Angular decorators,
so they need no Angular compilation of their own.

The hosted platforms (Vercel, Netlify, AWS Lambda, Azure Functions, Fastly
Compute, Deno Deploy, and Nitro's presets for them) have been checked locally,
with each platform's own tooling or a stand-in for it, but not yet on a real
deployment. Each page says what was checked. Next: pick your runtime from the
table.
