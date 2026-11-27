import { Component, afterNextRender, input, signal } from '@angular/core';
import type { WidgetData } from './example-backend';

/** The slow part of the page: server HTML until Angular hydrates it. */
@Component({
  selector: 'example-widget',
  template: `
    <div data-widget [attr.data-hydrated]="hydrated()">
      <p>
        @if (hydrated()) {
          Hydrated
        } @else {
          Server HTML, not hydrated yet
        }
      </p>
      <p>Answered by the {{ data().answeredBy }} after {{ data().delayMs }} ms.</p>
      <p aria-live="polite">Count: {{ count() }}</p>
      <button type="button" (click)="count.set(count() + 1)">Add one</button>
    </div>
  `,
})
export class Widget {
  readonly data = input.required<WidgetData>();

  protected readonly hydrated = signal(false);
  protected readonly count = signal(0);

  constructor() {
    afterNextRender(() => this.hydrated.set(true));
  }
}
