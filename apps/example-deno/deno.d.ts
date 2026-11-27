/**
 * The part of Deno's runtime API that `src/server.ts` uses, so the app type-checks in `vp build`,
 * which runs on Node. Deno itself brings the full declarations (`deno types`).
 */
declare namespace Deno {
  function readTextFile(path: string | URL): Promise<string>;
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
