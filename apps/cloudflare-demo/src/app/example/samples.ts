import type { Sample } from '../code-sample';

/**
 * The least code a page needs to stream one part of itself. The example page
 * is built the same way; its own template adds the labels, the timings and a
 * pause before hydration.
 */
export const TEMPLATE: Sample = {
  file: 'page.html',
  key: ['@defer'],
  code: `<section>
  @defer (on immediate; hydrate when widget()) {
    <div>
      @if (widget(); as data) {
        <app-widget [data]="data" />
      } @else {
        <p>Loading…</p>
      }
    </div>
  }
</section>`,
};

export const COMPONENT: Sample = {
  file: 'page.ts',
  key: ['HttpClient'],
  code: `export class Page {
  // An ordinary request. Nothing here knows about streaming.
  readonly widget = toSignal(
    inject(HttpClient).get<WidgetData>('/api/widget'),
  );
}`,
};

export const CONFIG: Sample = {
  file: 'app.config.ts',
  key: ['streamHttpInterceptor])', 'provideStreamHydration()'],
  code: `import {
  provideStreamHydration,
  streamHttpInterceptor,
} from '@push-based/angular-ssr-stream-core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([streamHttpInterceptor])),
    provideClientHydration(withEventReplay()),
    // After provideClientHydration().
    provideStreamHydration(),
  ],
};`,
};

export const WORKER: Sample = {
  file: 'worker.ts',
  key: ['createStreamingWorker({'],
  code: `import { createStreamingWorker } from '@push-based/angular-ssr-stream-cloudflare';

// config is appConfig plus provideServerRendering().
export default createStreamingWorker({
  rootComponent: App,
  config,
  allowedHosts: ['localhost'],
});`,
};
