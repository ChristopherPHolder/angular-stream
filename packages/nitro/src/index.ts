import {
  type StreamingAppOptions,
  createStreamingHandler,
} from '@push-based/angular-stream-core/server';
import { type H3Event, defineHandler } from 'nitro';
import { useKV } from 'nitro/kv';
import { TEMPLATE_ASSETS, TEMPLATE_KEY } from './template';

export type { StreamingAppOptions } from '@push-based/angular-stream-core/server';

/**
 * A Nitro event handler that streams the application. Make it the server
 * entry (`serverEntry` in the Nitro config), so that every request Nitro
 * doesn't answer with a static file or a route of its own is rendered.
 *
 * The template is the built `index.html`, read from the server assets that
 * `streamingTemplate()` from `@push-based/angular-stream-nitro/vite` fills:
 * it is bundled into the server, so it works on every preset, including those
 * with no filesystem. In `vite dev` it is the `index.html` Vite serves, with
 * its dev transforms.
 */
export function defineStreamingHandler(
  options: StreamingAppOptions,
): (event: H3Event) => Promise<Response> {
  const handle = createStreamingHandler({
    ...options,
    loadTemplate: async () => {
      const html = await useKV(`assets:${TEMPLATE_ASSETS}`).getItemRaw<string>(TEMPLATE_KEY);
      return html == null
        ? new Response('Template not found.', { status: 404 })
        : new Response(String(html), { headers: { 'content-type': 'text/html;charset=utf-8' } });
    },
  });

  return defineHandler((event) => handle(event.req));
}
