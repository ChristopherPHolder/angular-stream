<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-stream/main/press-kit/logo/png/angular-stream-logo.png"
    alt="angular-stream"
    width="420"
  />
</p>

# @push-based/angular-stream-nitro

Streamed server-side rendering for Angular on Nitro, and so on every host Nitro
has a preset for: Node, Bun, Deno, Vercel, Netlify, Cloudflare and more. The
browser starts hydrating the page while the response is still arriving. This
is the Nitro adapter of
[`@push-based/angular-stream-core`](https://www.npmjs.com/package/@push-based/angular-stream-core):
`defineStreamingHandler()`, an h3 handler for Nitro's server entry, and
`streamingTemplate()`, a Vite plugin that gives it the built `index.html`.

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-nitro@next unstorage
npm install -D nitro
```

```ts
// src/server.ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { defineStreamingHandler } from '@push-based/angular-stream-nitro';

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

- [The docs](https://push-based.github.io/angular-stream/): start with
  [Nitro](https://push-based.github.io/angular-stream/docs/getting-started/nitro),
  then [this package's API](https://push-based.github.io/angular-stream/docs/reference/nitro).
- [The repository](https://github.com/push-based/angular-stream), with a demo
  and an example app that uses it.
