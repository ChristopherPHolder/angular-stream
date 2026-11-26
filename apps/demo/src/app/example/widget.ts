import { Component, afterNextRender, input, signal } from '@angular/core';
import { logDemoEvent } from '../event-log';

/**
 * The widget. The server renders it as soon as its data is there, and it
 * arrives in a chunk; until Angular hydrates it, it is plain HTML.
 * `afterNextRender` only runs in the browser once the component is live, so it
 * marks the moment of hydration.
 */
@Component({
  selector: 'demo-widget',
  template: `
    <div class="widget" [class.widget--live]="hydrated()">
      <p class="widget-state">
        @if (hydrated()) {
          Hydrated
        } @else {
          Server HTML · not hydrated yet
        }
      </p>
      <p class="widget-value" aria-live="polite">{{ count() }}</p>
      <button
        class="pb-btn pb-btn-lg pb-btn-primary"
        type="button"
        (click)="count.set(count() + 1)"
      >
        Add one
      </button>
      <p class="widget-note">
        @if (hydrated()) {
          Angular owns the widget now, so the button works.
        } @else {
          The server rendered this once its data was ready, after {{ delayMs() }} ms, and streamed
          it into the open page. Angular hasn't taken it over yet, so nothing on it runs.
        }
      </p>
    </div>
  `,
  styleUrl: './widget.css',
})
export class Widget {
  readonly delayMs = input.required<number>();

  protected readonly hydrated = signal(false);
  protected readonly count = signal(0);

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      logDemoEvent('hydrate', 'Widget hydrated.');
    });
  }
}
