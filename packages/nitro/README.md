<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-ssr-stream/main/press-kit/logo/png/angular-ssr-stream-logo.png"
    alt="angular-ssr-stream"
    width="500"
  />
</p>

# @push-based/angular-ssr-stream-nitro

Streamed server-side rendering for Angular on Nitro, deployable with any of
Nitro's presets: Node, Bun, Deno, Vercel, Netlify, Cloudflare and more. It
streams on the presets the docs list as checked; a few, such as `aws_lambda`,
buffer as Nitro ships them. The
browser starts hydrating the page while the response is still arriving. This
is the Nitro adapter of
[`@push-based/angular-ssr-stream-core`](https://www.npmjs.com/package/@push-based/angular-ssr-stream-core):
`defineStreamingHandler()`, an h3 handler for Nitro's server entry, and
`streamingTemplate()`, a Vite plugin that gives it the built `index.html`.

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-nitro@next unstorage
npm install -D nitro@3.0.261103-rc
```

Nitro 3 is a release candidate. Nitro numbers its release candidates by date
(`3.0.261103-rc`), and no version range can follow them, so the package asks
for exactly the one it was checked with, and moves with each new one.
`unstorage` 2, which Nitro's storage needs, is still a beta.

```ts
// src/server.ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { defineStreamingHandler } from '@push-based/angular-ssr-stream-nitro';

export default defineStreamingHandler({
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  allowedHosts: ['localhost', 'my-app.vercel.app'],
});
```

```ts
// vite.config.ts
plugins: [
  ngp({ entries: ['src/main.ts', 'src/server.ts'] }),
  streamingTemplate(),
  nitro({ serverEntry: './src/server.ts' }),
],
```

- [The docs](https://push-based.github.io/angular-ssr-stream/): start with
  [Nitro](https://push-based.github.io/angular-ssr-stream/docs/getting-started/nitro),
  then [this package's API](https://push-based.github.io/angular-ssr-stream/docs/reference/nitro).
- [The repository](https://github.com/push-based/angular-ssr-stream), with a demo
  and an example app that uses it.
