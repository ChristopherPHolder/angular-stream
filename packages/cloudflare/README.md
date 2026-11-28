<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-ssr-stream/main/press-kit/logo/png/angular-ssr-stream-logo.png"
    alt="angular-ssr-stream"
    width="500"
  />
</p>

# @push-based/angular-ssr-stream-cloudflare

Streamed server-side rendering for Angular on Cloudflare Workers. The browser
starts hydrating the page while the response is still arriving. This is the
Workers adapter of
[`@push-based/angular-ssr-stream-core`](https://www.npmjs.com/package/@push-based/angular-ssr-stream-core):
`createStreamingWorker()`, a Worker `fetch` handler over the `ASSETS` binding.

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-cloudflare@next
```

```ts
// src/worker.ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-ssr-stream-cloudflare';

export default createStreamingWorker({
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

- [The docs](https://push-based.github.io/angular-ssr-stream/): start with
  [Cloudflare Workers](https://push-based.github.io/angular-ssr-stream/docs/getting-started/cloudflare-workers),
  then [this package's API](https://push-based.github.io/angular-ssr-stream/docs/reference/cloudflare).
- [The repository](https://github.com/push-based/angular-ssr-stream), with a demo
  and a real app that use it.
