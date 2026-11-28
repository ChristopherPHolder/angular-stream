<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-ssr-stream/main/press-kit/logo/png/angular-ssr-stream-logo.png"
    alt="angular-ssr-stream"
    width="500"
  />
</p>

# @push-based/angular-ssr-stream-node

Streamed server-side rendering for Angular on Node. The browser starts
hydrating the page while the response is still arriving. This is the Node
adapter of
[`@push-based/angular-ssr-stream-core`](https://www.npmjs.com/package/@push-based/angular-ssr-stream-core):
`createNodeHandler()`, a request handler for `node:http` that is also Connect
and Express middleware, and the pieces it is made of for other Node frameworks.

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-node@next
```

```ts
// src/server.ts
import { createServer } from 'node:http';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createNodeHandler } from '@push-based/angular-ssr-stream-node';

const handler = createNodeHandler({
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  allowedHosts: ['localhost', 'my-app.example.com'],
  template: new URL('./index.server.html', import.meta.url),
  staticDir: new URL('../client/', import.meta.url),
});

export default handler; // for `vite dev`

if (import.meta.env.PROD) {
  createServer(handler).listen(Number(process.env['PORT'] ?? 3000));
}
```

```ts
// vite.config.ts
import { angularStreamNode } from '@push-based/angular-ssr-stream-node/vite';

plugins: [angularStreamNode({ entry: 'src/server.ts' }), ngp({ ssr: { entry: 'src/server.ts' } })];
```

- [The docs](https://push-based.github.io/angular-ssr-stream/): start with
  [Node](https://push-based.github.io/angular-ssr-stream/docs/getting-started/node),
  then [this package's API](https://push-based.github.io/angular-ssr-stream/docs/reference/node)
  and [Streaming through proxies](https://push-based.github.io/angular-ssr-stream/docs/guides/streaming-through-proxies).
- [The repository](https://github.com/push-based/angular-ssr-stream), with an
  example that uses it.
