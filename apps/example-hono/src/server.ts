import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { type Context, Hono } from 'hono';
import type { ViteDevServer } from 'vite-plus';
import { config } from './app/app.config.server';

/** In `vite dev`, @hono/vite-dev-server passes the app Vite's dev server as `c.env.vite`. */
type Env = { Bindings: { vite?: ViteDevServer } };

/** The browser build: dist/client, next to this file's dist/server. */
const client = fileURLToPath(new URL('../client/', import.meta.url));

const handle = createStreamingHandler<Env['Bindings']>({
  rootComponent: ExamplePage,
  config,
  eventDispatchContract,
  allowedHosts: ['localhost'],
  // The built index.html; in `vite dev`, the source one with Vite's transforms.
  loadTemplate: async (request, { vite }) =>
    new Response(
      vite
        ? await vite.transformIndexHtml(
            request.url,
            await readFile(`${vite.config.root}/index.html`, 'utf8'),
          )
        : await readFile(`${client}index.html`),
    ),
});

const page = (c: Context<Env>) => handle(c.req.raw, c.env);

const app = new Hono<Env>();

if (!import.meta.env.DEV) {
  // `/` first: serveStatic would answer it with dist/client/index.html, the bare template.
  app.get('/', page);
  app.use(serveStatic({ root: client }));
}
app.get('*', page);

export default app;

// `vite dev` imports the app and serves it itself; the build listens.
if (!import.meta.env.DEV) {
  const port = Number(process.env['PORT'] ?? 3000);
  serve({ fetch: app.fetch, port }, ({ port }) =>
    console.log(`Listening on http://localhost:${port}`),
  );
}
