import { ApplicationConfig, mergeApplicationConfig, Service } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideFastSVG, SvgLoadStrategy } from '@push-based/ngx-fast-svg';
import { provideRxRenderStrategies } from '@rx-angular/cdk/render-strategies';
import { concatMap, EMPTY, Observable, of } from 'rxjs';
import { appConfig } from './app.config';
import { SVG_ICONS } from './renderer/svg-icons';
import { RxServerRenderStrategy } from './rx-server-render-strategy';

/**
 * Server-side SVG load strategy for the Cloudflare Workers runtime.
 *
 * The default `SvgLoadStrategyImpl` reads `window` in its constructor (throws
 * under SSR) and fetches icons over HTTP, and the original Node app read them
 * from disk with `node:fs` — neither works on Workers (`ssr.platform:
 * "neutral"`, no `window`, no filesystem).
 *
 * Instead icons are inlined into the server bundle at build time (see
 * `renderer/svg-icons.ts`). The strategy resolves each icon name to its markup
 * synchronously, so the real `<svg>` is rendered into the SSR HTML and
 * ngx-fast-svg hydrates it from the DOM on the client — no network request and
 * no loader-fallback flash. Unknown names complete without emitting so the
 * library keeps its placeholder rather than crashing on empty markup.
 */
@Service({ autoProvided: false })
export class ServerSvgLoadStrategy implements SvgLoadStrategy {
  config(name: string): Observable<string> {
    return of(name);
  }
  load(name$: Observable<string>): Observable<string> {
    return name$.pipe(
      concatMap((name) => {
        const svg = SVG_ICONS[name];
        return svg ? of(svg) : EMPTY;
      }),
    );
  }
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    // Force synchronous (native) rendering during SSR so rx-angular's
    // concurrent strategies don't cause a hydration flicker. See
    // ./rx-server-render-strategy.
    provideRxRenderStrategies(RxServerRenderStrategy),
    provideFastSVG({
      // Pass the icon name straight through; the strategy resolves it against
      // the inlined icon map rather than fetching a URL.
      url: (name: string) => name,
      svgLoadStrategy: ServerSvgLoadStrategy,
    }),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
