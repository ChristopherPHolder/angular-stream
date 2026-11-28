import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';

/**
 * Where the Vite plugin (`@push-based/angular-ssr-stream-node/vite`) leaves the dev
 * server's template on the Node request. `Symbol.for`, because the plugin and
 * the handler are different copies of this module in dev: Vite's config loader
 * loads one, the server environment's module runner the other.
 *
 * It holds the template, or, for a request forwarded for the plugin's
 * `routes`, a function that reads it.
 */
export const DEV_TEMPLATE = Symbol.for('@push-based/angular-ssr-stream-node:template');

/**
 * Loads a template for the core's `loadTemplate`: `(request, req)`, with `req`
 * the Node request the page is rendered for.
 */
export type TemplateLoader = (request: Request, req?: IncomingMessage) => Promise<Response>;

/**
 * Loads the built template from disk, the first time it is asked for, and
 * keeps it in memory from then on. The result fits the core's `loadTemplate`;
 * pass it the Node request as the second argument.
 *
 * In `vite dev`, the plugin from `@push-based/angular-ssr-stream-node/vite` leaves
 * the dev server's template on the Node request, and that is used instead: the
 * built file doesn't exist there.
 *
 * Nothing is read until the first request, so creating it never fails. A read
 * that fails rejects, and is tried again on the next request.
 */
export function createTemplateLoader(file: string | URL): TemplateLoader {
  let text: Promise<string> | undefined;

  return async (_request, req) => {
    const devTemplate = (req as (IncomingMessage & { [DEV_TEMPLATE]?: unknown }) | undefined)?.[
      DEV_TEMPLATE
    ];
    if (typeof devTemplate === 'string') {
      return htmlResponse(devTemplate);
    }
    // A request the plugin forwards for `routes`: read only when a page needs it.
    if (typeof devTemplate === 'function') {
      return htmlResponse(await (devTemplate as () => Promise<string>)());
    }

    text ??= readFile(file, 'utf8').catch((error: unknown) => {
      text = undefined;
      throw error;
    });

    return htmlResponse(await text);
  };
}

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
