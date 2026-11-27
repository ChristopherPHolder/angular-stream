<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-stream/main/press-kit/logo/png/angular-stream-logo.png"
    alt="angular-stream"
    width="420"
  />
</p>

# @push-based/angular-stream-cloudflare

Streamed server-side rendering for Angular on Cloudflare Workers. The browser
starts hydrating the page while the response is still arriving. This is the
Workers adapter of
[`@push-based/angular-stream-core`](https://www.npmjs.com/package/@push-based/angular-stream-core):
`createStreamingWorker()`, a Worker `fetch` handler over the `ASSETS` binding.

```bash
npm install @push-based/angular-stream-core@next @push-based/angular-stream-cloudflare@next
```

```ts
// src/worker.ts
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { createStreamingWorker } from '@push-based/angular-stream-cloudflare';

export default createStreamingWorker({
  rootComponent: App,
  config, // the server ApplicationConfig
  eventDispatchContract, // for withEventReplay()
  allowedHosts: ['localhost', 'my-app.example.workers.dev'],
}) satisfies ExportedHandler<Env>;
```

- [The docs](https://push-based.github.io/angular-stream/): start with
  [Cloudflare Workers](https://push-based.github.io/angular-stream/docs/getting-started/cloudflare-workers),
  then [this package's API](https://push-based.github.io/angular-stream/docs/reference/cloudflare).
- [The repository](https://github.com/push-based/angular-stream), with a demo
  and a real app that use it.
