import { HttpClient } from '@angular/common/http';
import { Component, afterNextRender, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { WidgetData } from './backend';

/** A shell sent at once, and one widget that streams in when its data is there. */
@Component({
  selector: 'app-page',
  template: `
    <main>
      <h1>Compatibility fixture</h1>
      <p data-shell>Sent at once.</p>
      <section>
        @defer (on immediate; hydrate when widget()) {
          <div>
            @if (widget(); as data) {
              <div data-widget [attr.data-hydrated]="hydrated()">
                <p>Answered by the {{ data.answeredBy }}.</p>
                <p>Count: {{ count() }}</p>
                <button type="button" (click)="count.set(count() + 1)">Add one</button>
              </div>
            } @else {
              <p data-placeholder>Loading…</p>
            }
          </div>
        }
      </section>
    </main>
  `,
})
export class Page {
  protected readonly widget = toSignal(inject(HttpClient).get<WidgetData>('/api/widget'));
  protected readonly hydrated = signal(false);
  protected readonly count = signal(0);

  constructor() {
    afterNextRender(() => this.hydrated.set(true));
  }
}
