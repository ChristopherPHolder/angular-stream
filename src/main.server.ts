import { mergeApplicationConfig, ɵIS_INCREMENTAL_HYDRATION_ENABLED } from '@angular/core';
import { bootstrapApplication, type BootstrapContext } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * Every hostname the Worker answers for. Angular's SSR host guard rejects any
 * request whose `host` header isn't listed, with NG05706.
 *
 * Shared with the streaming renderer, which drives the platform directly and
 * so has to apply the same guard itself rather than getting it from
 * `renderApplication`.
 */
export const ALLOWED_HOSTS = [
  'localhost',
  'angular-stream.chris-holder.workers.dev',
] as const;

/**
 * The fallback renders without incremental hydration: `@defer` blocks are left
 * for the client to render, from the transfer state this render fills.
 *
 * Angular renders a `hydrate when` block during a template update on the
 * server, which fails with NG0600 whenever the surrounding component has
 * signal queries. The streaming renderer works around that by rendering the
 * blocks itself; `renderApplication` offers no place to do the same.
 */
const bufferedConfig = mergeApplicationConfig(config, {
  providers: [{ provide: ɵIS_INCREMENTAL_HYDRATION_ENABLED, useValue: false }],
});

/**
 * Buffered render: one string, once the application is stable.
 *
 * Kept as the fallback for when the streaming renderer fails before it has
 * committed anything to the wire — at that point a real status code is still
 * possible, which streaming gives up at its first flush.
 */
export default function render(url: string, document: string): Promise<string> {
  return renderApplication(
    (context: BootstrapContext) => bootstrapApplication(App, bufferedConfig, context),
    {
      document,
      url,
      allowedHosts: [...ALLOWED_HOSTS],
    },
  );
}
