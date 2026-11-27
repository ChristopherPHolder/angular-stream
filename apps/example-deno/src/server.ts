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

/**
 * Static files from the browser build; every other request is a page, rendered as a stream.
 * `/index.html` is the template, so it's rendered too, never served as a file. A missing
 * file under `/assets/` (an old hashed chunk after a deploy) stays a 404.
 */
Deno.serve(async (request) => {
  const { pathname } = new URL(request.url);
  if (pathname !== '/index.html') {
    const file = await serveDir(request, { fsRoot: clientDir, showIndex: false, quiet: true });
    if (file.status !== 404 || pathname.startsWith('/assets/')) {
      return file;
    }
  }
  return render(request);
});
