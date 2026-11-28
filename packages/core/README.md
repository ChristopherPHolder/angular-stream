<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-ssr-stream/main/press-kit/logo/png/angular-ssr-stream-logo.png"
    alt="angular-ssr-stream"
    width="500"
  />
</p>

# @push-based/angular-ssr-stream-core

Streamed server-side rendering for Angular. The browser starts hydrating the
page while the response is still arriving. This is the runtime-agnostic core:
the streaming renderer, its inline runtime and the client. It speaks web
`Request`, `Response` and streams, and nothing else; a runtime adapter such as
[`@push-based/angular-ssr-stream-cloudflare`](https://www.npmjs.com/package/@push-based/angular-ssr-stream-cloudflare)
puts it on a server.

```bash
npm install @push-based/angular-ssr-stream-core@next
```

```ts
// src/app/app.config.ts
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';

providers: [
  provideHttpClient(withInterceptors([streamHttpInterceptor /* , ... */])),
  provideClientHydration(/* ... */),
  provideStreamHydration(), // after provideClientHydration()
];
```

It needs Angular `~22.3.0-rc.0`, standalone, with incremental hydration,
zoneless or with Zone.js.

- [The docs](https://push-based.github.io/angular-ssr-stream/): getting started,
  guides, how it works, and [this package's API](https://push-based.github.io/angular-ssr-stream/docs/reference/core).
- [The repository](https://github.com/push-based/angular-ssr-stream), with a demo
  and a real app that use it.
