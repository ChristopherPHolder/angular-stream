Deno speaks web `Request` and `Response` natively, so it needs no adapter
package: `createStreamingHandler()` from the core is the whole server. Vite with
ngp builds the browser app and one server bundle, and Deno runs that bundle with
`Deno.serve()`. The template is read with `Deno.readTextFile()`, and static
files are served by `serveDir` from `@std/http`.

The repository's `apps/example-deno` is this setup, and every block below is
taken from it; its server is
[`src/server.ts`](../../../../../apps/example-deno/src/server.ts).

## 1. The browser config

The same as on any other runtime: the interceptor and the stream's providers
next to Angular's hydration.

```ts title="src/app/app.config.ts"
import { provideStreamHydration, streamHttpInterceptor } from '@push-based/angular-stream-core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration(): it replaces a provider from there.
    provideStreamHydration(),
  ],
};
```

[Cloudflare Workers](cloudflare-workers.md#1-the-browser-config) explains what
each provider does.

## 2. The server config

```ts title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

export const config = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering()],
});
```

## 3. The server

Install `@std/http` from JSR. pnpm (10.9 and later) and Yarn take a `jsr:`
version directly; with npm, use `npx jsr add @std/http`.

```bash
pnpm add @std/http@jsr:^1.1.4
```

Then the server entry:

```ts title="src/server.ts"
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { serveDir } from '@std/http/file-server';
import { App } from './app/app';
import { config } from './app/app.config.server';

// The bundle is dist/server/server.js: the template sits next to it, the browser build beside it.
const template = await Deno.readTextFile(`${import.meta.dirname}/index.server.html`);
const clientDir = `${import.meta.dirname}/../client`;

const render = createStreamingHandler({
  rootComponent: App,
  config,
  allowedHosts: ['localhost'],
  loadTemplate: async () => new Response(template),
});

/** Static files from the browser build; every other request is a page, rendered as a stream. */
Deno.serve(async (request) => {
  const file = await serveDir(request, { fsRoot: clientDir, showIndex: false, quiet: true });
  return file.status === 404 ? render(request) : file;
});
```

`serveDir` answers every request for a file in `dist/client`. Anything it
doesn't find is a page, and goes to the handler. `showIndex: false` matters:
without it, `/` would be answered with `dist/client/index.html`, the template
with nothing rendered into it.

The template is `index.server.html`, which ngp writes next to the server
bundle: the built `index.html` with the event dispatch contract already in it,
so the handler needs no `eventDispatchContract`. It is read once, at startup,
and every request gets a fresh `Response` of it.

`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the server answers `403`.

Paths are relative to `import.meta.dirname`, the bundle's folder, not to the
working directory, so the server can be started from anywhere.

## 4. Vite

```ts title="vite.config.ts"
import { ngp } from '@push-based/vite-plugin-ngp';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  environments: {
    ssr: {
      // One self-contained server bundle: Deno runs it with no node_modules and no import map.
      resolve: { noExternal: true },
      // The bundle is Deno's main module, so `import.meta.main` would be true in every module in it,
      // and `@std/http/file-server` would start its own file server on the working directory.
      define: { 'import.meta.main': 'false' },
      build: { copyPublicDir: false },
    },
  },
  plugins: [ngp({ ssr: { entry: 'src/server.ts' } })],
});
```

ngp's `ssr` option builds the browser app into `dist/client` and
`src/server.ts` into `dist/server/server.js`. The server bundle holds
everything, Angular, `@std/http` and the core included, so Deno needs neither
`node_modules` nor a `deno.json` to run it.

> [!WARNING]
> Keep the `import.meta.main` line. `@std/http/file-server` is also a CLI and
> starts a file server on the current directory when it is the main module.
> Bundled, it is part of the main module, so without the `define` the bundle
> starts a second server, on port 8000, that serves the working directory.

### Types

`vite build` runs on Node, and type-checks `src/server.ts` there, where `Deno`
doesn't exist. Declare the part of it the server uses:

```ts title="deno.d.ts"
declare namespace Deno {
  function readTextFile(path: string | URL): Promise<string>;
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
```

and add `deno.d.ts` to `include` in `tsconfig.app.json`. Deno itself has the
full declarations (`deno types`).

## 5. Build and run

```bash
vite build
deno run --allow-net --allow-read=dist dist/server/server.js
```

The server listens on port 8000. It needs to read `dist` and to listen, and no
other permission. Check that it streams:

```bash
curl -N http://localhost:8000/
```

The shell, with the widget's placeholder, arrives at once, and each `@defer`
block follows in a `<template data-ngs>` chunk when its data is there. A
response that arrives all at once means something buffered it; see
[Debugging and verifying](../guides/debugging.md).

### While developing

There is no dev server that renders in Deno: `vite dev` renders on Node. Rebuild
on every change instead, and let Deno restart on every new build:

```bash
vite build --watch
deno run --watch=dist/ --allow-net --allow-read=dist dist/server/server.js
```

`--watch=dist/` restarts on the template and the browser build too, not only on
the server bundle's own modules. There is no hot module replacement, and the
build is a production build, so Angular's dev-mode hydration checks are off.

## 6. Deno Deploy

> [!WARNING]
> Deno Deploy shuts down in April 2027; see
> [the notice in Deno's docs](https://docs.deno.com/deploy/). Deploy Classic
> and `deployctl` are already gone. What follows is for the current Deno
> Deploy and its `deno deploy` command.

Deno Deploy runs the same Deno, with full file system access to the files of
the deployment, so the server above runs there unchanged:
`Deno.readTextFile()` reads the template and `serveDir` reads `dist/client`.
Nothing has to be imported into the bundle. Only two things change:

- **`allowedHosts`** lists the hostname Deploy gives the app, and any custom
  domain, next to `localhost`.
- **The deployment has to contain `dist`.** Build it with Node first: ngp
  needs Node, and Deploy's builder runs JavaScript with Deno. Then upload the
  output.

`deno deploy` uploads the current directory but skips everything
`.gitignore` lists, and `dist` usually is. Name it in `include`, as a
directory, not a glob; a glob such as `dist/**` does not override
`.gitignore`:

```jsonc title="deno.json"
{
  "deploy": {
    "org": "my-org",
    "app": "my-app",
    "include": ["dist"],
    "runtime": {
      "mode": "dynamic",
      "entrypoint": "dist/server/server.js",
    },
  },
}
```

```bash
vite build
deno deploy --prod
```

With `include`, only `dist` is uploaded: the server bundle is self-contained,
so the deployment needs no `package.json` and no install step. `org` and `app`
are filled in by `deno deploy` the first time it runs.

Deno Deploy runs Deno 2.5, which compresses a response when the browser
accepts it. That doesn't hold the stream back: each chunk is flushed through the
encoder as it's written, and the shell still arrives at once.

> [!NOTE]
> The repository checks this setup on Deno 2.5 locally, and checks the
> `include` rule with the `deno deploy` command's own file list. It has not
> been run against a real Deno Deploy app, so check the result with
> `curl -N https://<your app>/` after the first deploy.

## 7. Supabase Edge Functions

Supabase Edge Functions run on Deno too, but they are built for APIs, not
pages, and in practice they can't serve this app:

- **HTML is rewritten to plain text.** On the shared `supabase.co` domain, a
  `GET` that returns `text/html` is
  [served as `text/plain`](https://supabase.com/docs/guides/functions/limits).
  Only a custom domain, a paid add-on, serves HTML.
- **There is no static hosting.** The browser build has to live somewhere else,
  such as a public Storage bucket or a CDN, with Vite's `base` pointing there.
  The template can ship with the function through `static_files` in
  `supabase/config.toml`, and is read with `Deno.readTextFile()` as above.
- **The app lives under a path.** A function answers at
  `/functions/v1/<name>/`, so `<base href>` and every route sit under that
  prefix.
- **Functions ask for a JWT by default.** A public page needs
  `verify_jwt = false` for the function in `supabase/config.toml`.
- **The limits are tight for rendering.** Each request gets 2 s of CPU time,
  and the bundle has to stay under 20 MB.

Each of these has a workaround, but together they make Supabase a poor host
for a server-rendered app. Serve the pages from Deno Deploy or any host that
runs Deno, and call your Supabase functions from there. This section has not
been checked against Supabase.

## 8. Stream something

Nothing streams until a template has a `@defer` block with a `hydrate`
trigger: read [Making something stream](../guides/making-something-stream.md).
