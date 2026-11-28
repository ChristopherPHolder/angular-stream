import { HttpClient } from '@angular/common/http';
import { Component, InjectionToken, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EXAMPLE_DELAY_MS, type WidgetData } from './example-backend';
import { Widget } from './widget';

/** The runtime's name, for the page heading: "Node", "Bun", … */
export const EXAMPLE_RUNTIME = new InjectionToken<string>('EXAMPLE_RUNTIME');

/**
 * The example's root component, and its only page. The shell is sent at once. The widget follows in a chunk once its data is
 * there, and hydrates as soon as it lands.
 */
@Component({
  selector: 'app-root',
  imports: [Widget],
  template: `
    <main>
      <h1>{{ runtime }}</h1>
      <p data-shell>This part was sent at once, before the widget's data existed.</p>
      <section>
        @defer (on immediate; hydrate when widget()) {
          <div>
            @if (widget(); as data) {
              <example-widget [data]="data" />
            } @else {
              <p data-placeholder>Loading the widget…</p>
            }
          </div>
        }
      </section>
    </main>
  `,
})
export class ExamplePage {
  /** The page heading: which runtime served it. */
  protected readonly runtime =
    inject(EXAMPLE_RUNTIME, { optional: true }) ?? 'angular-ssr-stream example';

  protected readonly widget = toSignal(
    inject(HttpClient).get<WidgetData>('/api/widget', { params: { delay: EXAMPLE_DELAY_MS } }),
  );
}
