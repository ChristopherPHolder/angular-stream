```bash
npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-nitro@next unstorage
npm install -D nitro@3.0.261103-rc
```

The Nitro adapter: an h3 event handler, and a Vite plugin that gives it the
template. It depends on [`@push-based/angular-ssr-stream-core`](core.md), whose
browser providers the app still needs, and on Nitro 3 with its Vite plugin. For
the whole setup, see [Nitro](../getting-started/nitro.md).

Nitro 3 is a release candidate. Nitro numbers its release candidates by date
(`3.0.261103-rc`), and no version range can follow them, so the package asks
for exactly the one it was checked with, and moves with each new one.
`unstorage` 2, which Nitro's storage needs, is still a beta.

## `defineStreamingHandler()`

```ts
import { defineStreamingHandler } from '@push-based/angular-ssr-stream-nitro';

function defineStreamingHandler(
  options: StreamingAppOptions,
): (event: H3Event) => Promise<Response>;

interface StreamingAppOptions {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /** The application's server config, provideServerRendering() included. */
  config: ApplicationConfig;
  /** Every hostname the server answers for. */
  allowedHosts: readonly string[];
  /** The contents of @angular/core/event-dispatch-contract.min.js, for withEventReplay(). */
  eventDispatchContract?: string;
}
```

An h3 event handler that streams the application: the core's
[`createStreamingHandler()`](core.md#createstreaminghandler), given the event's
web `Request` (`event.req`), with the template read from Nitro's server assets.
Export it from the file Nitro's `serverEntry` names:

```ts title="src/server.ts"
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';

export default defineStreamingHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.vercel.app'],
});
```

As the server entry it receives every request that Nitro doesn't answer with a
static file or a route of its own, and renders each one as a page.

The template is `index.html` in the server-assets mount `assets:angular-ssr-stream`,
read with `useKV()` from `nitro/kv`, which is why the app needs `unstorage`.
`streamingTemplate()` puts it there. If it isn't there, every page answers
`404`.

## `streamingTemplate()`

```ts
import { streamingTemplate } from '@push-based/angular-ssr-stream-nitro/vite';

function streamingTemplate(): Plugin;
```

A Vite plugin, added next to `nitro()`, that makes the app's `index.html` the
handler's template:

```ts title="vite.config.ts"
plugins: [
  ngp({ entries: ['src/main.ts', 'src/server.ts'] }),
  streamingTemplate(),
  nitro({ serverEntry: './src/server.ts', compatibilityDate: '2026-11-01' }),
],
```

- It registers `<buildDir>/angular-ssr-stream` (`node_modules/.nitro/angular-ssr-stream`
  by default) as the server-assets directory `angular-ssr-stream`.
- In `vite build` it takes the built `index.html` out of the client build, so
  that it is not in the static output for Nitro or a CDN to serve, and writes it
  to that directory. Nitro then bundles it into the server, whatever the preset.
  The build fails when the client build has no top-level `index.html`, rather
  than answering every page with `404` later. A template left there by
  `vite dev` is removed first, so it can't end up in a production bundle.
- In `vite dev` it writes the `index.html` Vite serves there, with Vite's dev
  transforms, and again whenever `index.html` changes.
- It makes `index.html` the client build's input, unless the config names one,
  and sets Nitro's `renderer` to `false`, unless the config sets it: otherwise
  Nitro would take `index.html` as its own renderer's template.

The plugin also carries a Nitro module (its `nitro` field), which is how it
reaches Nitro's options; it only works with Nitro's Vite plugin.
