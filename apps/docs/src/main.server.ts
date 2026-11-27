import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import { App } from './app/app';
import { config } from './app/app.config.server';

export { PRERENDERED_ROUTES } from './app/docs/nav';
export { SITE } from './app/links';

/**
 * ngp's server entry: renders one URL into `index.html`. The dev server calls
 * it for every page; `scripts/prerender.ts` calls it once per route after the
 * build.
 */
export default function render(url: string, document: string): Promise<string> {
  return renderApplication(
    (context: BootstrapContext) => bootstrapApplication(App, config, context),
    { document, url },
  );
}
