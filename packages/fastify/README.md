<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-stream/main/press-kit/logo/png/angular-stream-logo.png"
    alt="angular-stream"
    width="420"
  />
</p>

# @push-based/angular-stream-fastify

Streamed server-side rendering for Angular on Fastify. The browser starts
hydrating the page while the response is still arriving. This is a Fastify
plugin built on
[`@push-based/angular-stream-node`](https://www.npmjs.com/package/@push-based/angular-stream-node):
`angularStream` renders every `GET` and `HEAD` no other route answers, and
streams the page through Fastify's reply, so `@fastify/compress`, `onSend`
hooks and request logging still apply.

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-node@next @push-based/angular-stream-fastify@next fastify
```

```ts
// src/server.ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { angularStream } from '@push-based/angular-stream-fastify';
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ status: 'ok' }));
// The browser build: @fastify/static with `wildcard: false`.

app.register(angularStream, {
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  allowedHosts: ['localhost', 'my-app.example.com'],
  template: new URL('./index.server.html', import.meta.url),
});

// For `vite dev`, with angularStreamNode() from @push-based/angular-stream-node/vite.
export default function handle(req, res, next) {
  req.url = req.originalUrl ?? req.url;
  app.ready().then(() => app.routing(req, res), next);
}

if (import.meta.env.PROD) {
  app.listen({ port: Number(process.env['PORT'] ?? 3000) });
}
```

- [The docs](https://push-based.github.io/angular-stream/): start with
  [Fastify](https://push-based.github.io/angular-stream/docs/getting-started/fastify),
  then [this package's API](https://push-based.github.io/angular-stream/docs/reference/fastify)
  and [Streaming through proxies](https://push-based.github.io/angular-stream/docs/guides/streaming-through-proxies).
- [The repository](https://github.com/push-based/angular-stream), with an
  example that uses it.
