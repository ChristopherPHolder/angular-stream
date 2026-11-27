import { readFile } from 'node:fs/promises';

/**
 * Where the Vite plugin (`@push-based/angular-stream-node/vite`) leaves the dev
 * server's template on the Node request. `Symbol.for`, because the plugin and
 * the handler are different copies of this module in dev: Vite's config loader
 * loads one, the server environment's module runner the other.
 */
export const DEV_TEMPLATE = Symbol.for('@push-based/angular-stream-node:template');

/**
 * Loads the built template from disk, the first time it is asked for, and
 * keeps it in memory from then on. The result fits the core's `loadTemplate`.
 *
 * Nothing is read until the first request, so creating it never fails. A read
 * that fails rejects, and is tried again on the next request.
 */
export function createTemplateLoader(file: string | URL): () => Promise<Response> {
  let text: Promise<string> | undefined;

  return async () => {
    text ??= readFile(file, 'utf8').catch((error: unknown) => {
      text = undefined;
      throw error;
    });

    return new Response(await text, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
}
