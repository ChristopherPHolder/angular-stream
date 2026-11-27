import { ExamplePage } from '@angular-stream/stream-example';
import { createStreamingHandler } from '@push-based/angular-stream-core/server';
import { serveDir } from '@std/http/file-server';
import { config } from './app/app.config.server';

// The bundle is dist/server/server.js: the template sits next to it, the browser build beside it.
const template = await Deno.readTextFile(`${import.meta.dirname}/index.server.html`);
const clientDir = `${import.meta.dirname}/../client`;

const render = createStreamingHandler({
  rootComponent: ExamplePage,
  config,
  allowedHosts: ['localhost'],
  loadTemplate: async () => new Response(template),
});

/** Static files from the browser build; every other request is a page, rendered as a stream. */
Deno.serve(async (request) => {
  const file = await serveDir(request, { fsRoot: clientDir, showIndex: false, quiet: true });
  return file.status === 404 ? render(request) : file;
});
