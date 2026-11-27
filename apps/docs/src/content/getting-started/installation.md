## Requirements

- **Angular `~22.3.0-rc.0`**, standalone and zoneless, with incremental
  hydration. The packages use private Angular APIs (the `ɵ`-prefixed ones), so
  their supported range is narrow: each Angular minor needs a check and a
  release.
- **A server that speaks web `Request` and `Response`**, directly or through
  one of the adapters below.
- **As set up in these docs:** Vite with
  [`@push-based/vite-plugin-ngp`](https://github.com/push-based/vite-plugin-ngp)
  compiling Angular, and building the server bundle for the runtime. ngp needs
  Node 26 to build, and every `@angular/*` package pinned to exactly
  `22.3.0-rc.0`. What runs the result is up to the runtime.

`@angular/ssr` is not used. Its `AngularAppEngine`, server routes and render
modes are not available on this path; see
[Caveats and limitations](../reference/limitations.md).

## Install

Releases go to npm's `next` dist-tag while the supported Angular is a release
candidate:

```bash
npm install @push-based/angular-stream-core@next
```

Then the adapter for where it runs, if it has one. A runtime that hands the
server a web `Request` and takes a `Response` back needs no adapter: the
core's `createStreamingHandler()` is the whole server, and its page shows the
few lines around it.

| Where it runs                                   | Package                                 | Setup                                         |
| ----------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| Node (`node:http`, Connect)                     | `@push-based/angular-stream-node`       | [Node](node.md)                               |
| Express                                         | `@push-based/angular-stream-node`       | [Express](express.md)                         |
| Fastify                                         | `@push-based/angular-stream-fastify`    | [Fastify](fastify.md)                         |
| NestJS (on Express or Fastify)                  | `@push-based/angular-stream-nestjs`     | [NestJS](nestjs.md)                           |
| Koa                                             | `@push-based/angular-stream-node`       | [Koa](koa.md)                                 |
| Cloudflare Workers                              | `@push-based/angular-stream-cloudflare` | [Cloudflare Workers](cloudflare-workers.md)   |
| Hono (Node, Bun, Deno, Workers)                 | none                                    | [Hono](hono.md)                               |
| Deno, Deno Deploy                               | none                                    | [Deno](deno.md)                               |
| Bun                                             | none                                    | [Bun](bun.md)                                 |
| Fastly Compute                                  | none                                    | [Fastly Compute](fastly-compute.md)           |
| Vercel                                          | none                                    | [Vercel](vercel.md)                           |
| Netlify                                         | none                                    | [Netlify](netlify.md)                         |
| AWS Lambda                                      | `@push-based/angular-stream-aws-lambda` | [AWS Lambda](aws-lambda.md)                   |
| Azure Functions                                 | none                                    | [Azure Functions](azure-functions.md)         |
| Nitro, and the hosts its presets deploy to      | `@push-based/angular-stream-nitro`      | [Nitro](nitro.md)                             |
| A Service Worker, in the browser (experimental) | none                                    | [Service Worker](../guides/service-worker.md) |

Every package is released together, with one version: install the same
version of each.

The packages ship ESM and type declarations, and carry no Angular decorators,
so they need no Angular compilation of their own.

> [!NOTE]
> Until the first release is out, the packages are only available as source in
> [the repository](https://github.com/push-based/angular-stream), where
> the apps use them.

The hosted platforms (Vercel, Netlify, AWS Lambda, Azure Functions, Fastly
Compute, Deno Deploy, and Nitro's presets for them) have been checked locally,
with each platform's own tooling or a stand-in for it, but not yet on a real
deployment. Each page says what was checked. Next: pick your runtime from the
table.
