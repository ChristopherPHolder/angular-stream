This is the setup `apps/example-azure` in the repository uses: Angular
compiled by ngp through Vite, the server bundle running as one HTTP-triggered
function on the Node.js v4 programming model, static assets served by a static
host in front of it, and every navigation routed to the function.

> [!IMPORTANT]
> Azure Functions only streams a response when the function app calls
> `app.setup({ enableHttpStream: true })`. Without it the Functions host reads
> the whole body before it sends a byte: the page still renders, but arrives in
> one piece once the slowest request is done, and nothing streams.

There is no adapter package for Azure: the function converts the request and
the response itself, in a few lines, and hands the rest to
[`createStreamingHandler()`](../reference/core.md#createstreaminghandler).

## 1. The browser config

Add the interceptor and the stream's providers next to Angular's hydration:

```ts title="src/app/app.config.ts"
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration(): it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

`streamHttpInterceptor` reports each request to the renderer on the server,
and in the browser holds back a request the server is already making until its
response arrives on the stream. `provideStreamHydration()` keeps Angular's
hydration data and block registry in step with the chunks.

## 2. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 3. The function

```bash
npm install @azure/functions
```

```ts title="src/functions/ssr.ts"
import { readFile } from 'node:fs/promises';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { HttpResponse, app } from '@azure/functions';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { App } from '../app/app';
import { config } from '../app/app.config.server';

// Without this, the Functions host reads the whole body before it sends a byte.
app.setup({ enableHttpStream: true });

// The built index.html, deployed with the function app and read once per instance.
const templateFile = new URL('../client/index.html', import.meta.url);
let template: Promise<string> | undefined;

const handle = createStreamingHandler({
  rootComponent: App,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost', 'my-app.azurewebsites.net'],
  loadTemplate: async () => new Response(await (template ??= readFile(templateFile, 'utf8'))),
});

app.http('ssr', {
  route: '{*path}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const response = await handle(
      new Request(request.url, { method: request.method, headers: request.headers }),
    );

    return new HttpResponse({
      status: response.status,
      headers: response.headers,
      body: response.body ?? undefined,
    });
  },
});
```

`app.setup()` has to run before the function is registered, so it sits at the
top of the entry. With HTTP streams on, `request.headers` is a web `Headers`
and `HttpResponse` takes a web `ReadableStream` as its body, which the worker
writes to the connection chunk by chunk.

The `{*path}` route sends every path, `/` included, to the function. Static
assets never reach it: they are served by the host in front
([step 7](#7-static-assets)). The function answers `GET` only; the core
renders a page for whatever reaches it.

The template is the built `index.html`, deployed with the function app next to
the bundle (`dist/client/index.html`, one folder up from `dist/server/ssr.js`).
It is read from disk on the first request and kept for as long as the instance
lives.

`allowedHosts` must list every hostname the function answers for: Angular's
SSR host guard rejects any other `host` header, and the function answers
`403`. The host the function sees is the `Host` header of the request that
reaches the function app, not `X-Forwarded-Host`. Behind Front Door that is the
origin's host header: an origin added in the portal sends the function app's own
hostname (`my-app.azurewebsites.net`), one created from a template without that
field sends the hostname the visitor asked for.

`eventDispatchContract` is for `withEventReplay()`. The function renders into
the built `index.html`, which doesn't carry the script Angular needs to queue
the clicks made before the page hydrates, so the handler adds it. Leave it out
and those clicks are lost.

## 4. The function app

A function app on the v4 programming model is a folder with a `host.json` and a
`package.json` whose `main` names the files that register functions:

```json title="package.json"
{
  "type": "module",
  "main": "dist/server/ssr.js",
  "scripts": {
    "build": "vite build",
    "start": "func start"
  }
}
```

```json title="host.json"
{
  "version": "2.0",
  "extensions": {
    "http": {
      "routePrefix": ""
    }
  }
}
```

`routePrefix: ""` removes the default `/api` prefix, so the function is served
at `/` rather than `/api/`.

`local.settings.json` holds the settings `func start` uses locally. It isn't
deployed:

```json title="local.settings.json"
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```

## 5. Vite

```ts title="vite.config.ts"
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      resolve: { noExternal: true, external: ['@azure/functions'] },
      build: {
        outDir: 'dist/server',
        copyPublicDir: false,
        rolldownOptions: { input: { ssr: 'src/functions/ssr.ts' } },
      },
    },
  },
  plugins: [ngp({ entries: ['src/main.ts', 'src/functions/ssr.ts'] })],
});
```

`builder: {}` makes `vite build` build both environments: the browser app into
`dist/client` and the function into `dist/server/ssr.js`. ngp compiles the
function with its server compiler because it runs in the `ssr` environment;
its own `ssr` option stays off, since that expects a `render(url, document)`
entry. The function bundles all its dependencies except `@azure/functions`,
which has to be the copy the Functions worker loads, so the deployed app needs
only that one package in `node_modules`.

## 6. Run it locally

[Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
run the Functions host on your machine, with no Azure account:

```bash
vite build   # client to dist/client, function to dist/server
func start   # http://localhost:7071
```

`func start` serves the function but not the assets, so the page renders and
streams, but doesn't hydrate: every path, `/assets/*.js` included, is rendered
as a page. Check the stream with `curl`:

```bash
curl -sN http://localhost:7071/
```

The shell, with each `@defer` block's placeholder, arrives at once, and each
block's `<template data-ngs>` chunk follows as its data comes in. A response
that arrives in one piece means something buffered: check `enableHttpStream`
first.

To see the page hydrate locally, put something in front of `func start` that
serves `dist/client` and passes every other path on to port 7071 without
buffering, the way Front Door does in production.

## 7. Static assets

The function renders pages only. Everything else in `dist/client`, the
`assets/` folder and the icons, goes to a static host, with navigations routed
to the function:

- **Blob Storage behind Front Door.** Upload `dist/client`, without
  `index.html`, to a storage account's static website (`$web`). In Front Door,
  give the storage account and the function app an origin group each. Route
  `/assets/*` and the icon paths to the storage origin, with caching on, and
  `/*` to the function app, with caching off. Front Door only compresses on
  routes with caching on, and never a chunked response, so it doesn't hold the
  page back to compress it. A chunked response over 8 MB isn't supported.
- **Azure Static Web Apps, for the assets only.** A linked function app is
  reachable only under `/api`, its routes can only be redirected or secured,
  not rewritten to, and it has to keep the `/api` prefix this setup removes. So
  SWA can't send navigations through the function. It can serve `dist/client`
  as the asset origin behind Front Door, in place of Blob Storage.

Keep `index.html` out of the static host: it is the template, not a page.

## 8. Deploy

Deploy the function app folder: `host.json`, `package.json`, `dist/server`
and `dist/client/index.html`. `@azure/functions` is the only package the
bundle loads from `node_modules`. A `.funcignore` keeps the rest out:

```gitignore title=".funcignore"
local.settings.json
index.html
public/
src/
tsconfig*.json
vite.config.ts
dist/client/*
!dist/client/index.html
```

```bash
vite build
func azure functionapp publish my-app
```

HTTP streams need `@azure/functions` 4.3.0 or later, the Functions runtime
4.28 or later and, locally, Core Tools 4.0.5530 or later. ngp needs Node 26 to
build. The function itself runs on Node 24, the current GA release on Azure
Functions; Node 26 is in preview there, on Linux only
([supported versions](https://learn.microsoft.com/azure/azure-functions/supported-languages)).

> [!NOTE]
> This setup has been checked with `func start` on Node 24 and Node 26,
> streaming and hydrating, but not yet against a deployed function app or
> through Front Door.

## 9. Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
