## Requirements

- **Angular `~22.3.0-rc.0`**, standalone and zoneless, with incremental
  hydration. The packages use private Angular APIs (the `ɵ`-prefixed ones), so
  their supported range is narrow: each Angular minor needs a check and a
  release.
- **A server that speaks web `Request` and `Response`**, through one of the
  adapters. Today that is Cloudflare Workers.
- **For the Cloudflare adapter, as set up in these docs:** Vite with
  [`@push-based/vite-plugin-ngp`](https://github.com/push-based/vite-plugin-ngp)
  compiling Angular and
  [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/)
  running the server bundle in workerd. ngp needs Node 26, and every
  `@angular/*` package pinned to exactly `22.3.0-rc.0`.

`@angular/ssr` is not used. Its `AngularAppEngine`, server routes and render
modes are not available on this path; see
[Caveats and limitations](../reference/limitations.md).

## Install

Releases go to npm's `next` dist-tag while the supported Angular is a release
candidate:

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-cloudflare@next
```

The packages ship ESM and type declarations, and carry no Angular decorators,
so they need no Angular compilation of their own.

> [!NOTE]
> Until the first release is out, the packages are only available as source in
> [the repository](https://github.com/push-based/angular-stream), where
> both apps use them.

Next: [set up a Cloudflare Worker](cloudflare-workers.md).
