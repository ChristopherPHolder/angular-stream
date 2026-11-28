<p align="center">
  <img
    src="https://raw.githubusercontent.com/push-based/angular-ssr-stream/main/press-kit/logo/png/angular-ssr-stream-logo.png"
    alt="angular-ssr-stream"
    width="500"
  />
</p>

# @push-based/angular-ssr-stream-angular-ssr

Streamed server-side rendering for apps built by the Angular CLI and served by
`@angular/ssr`. The browser starts hydrating the page while the response is
still arriving. `@angular/ssr` stays in charge: its host check, server routes,
render modes, redirects and prerendered pages all work as before, and the
routes it renders on the server stream. This is the `@angular/ssr` adapter of
[`@push-based/angular-ssr-stream-core`](https://www.npmjs.com/package/@push-based/angular-ssr-stream-core).

```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-angular-ssr@next
```

From an app made by `ng new --ssr`:

```ts
// src/server.ts
import { withStreaming } from '@push-based/angular-ssr-stream-angular-ssr';

const angularApp = withStreaming(new AngularNodeAppEngine());

// src/main.server.ts
export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';

// src/app/app.config.ts
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-ssr-stream-core';

providers: [
  provideHttpClient(withFetch(), withInterceptors([streamHttpInterceptor])),
  provideClientHydration(withEventReplay()),
  provideStreamHydration(), // after provideClientHydration()
];

// src/app/app.routes.server.ts: stream what isn't prerendered
{ path: '**', renderMode: RenderMode.Server }
```

- [Angular CLI](https://push-based.github.io/angular-ssr-stream/docs/getting-started/angular-cli):
  the setup, step by step.
- [This package's API](https://push-based.github.io/angular-ssr-stream/docs/reference/angular-ssr).
- [The repository](https://github.com/push-based/angular-ssr-stream), with an
  example app made by `ng new --ssr`.
