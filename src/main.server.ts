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
 * Buffered render: one string, once the application is stable.
 *
 * Kept as the fallback for when the streaming renderer fails before it has
 * committed anything to the wire — at that point a real status code is still
 * possible, which streaming gives up at its first flush.
 */
export default function render(url: string, document: string): Promise<string> {
  return renderApplication(
    (context: BootstrapContext) => bootstrapApplication(App, config, context),
    {
      document,
      url,
      allowedHosts: [...ALLOWED_HOSTS],
    },
  );
}
