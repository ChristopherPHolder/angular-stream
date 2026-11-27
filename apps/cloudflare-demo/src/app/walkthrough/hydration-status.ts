import { Component, afterNextRender, input, signal } from '@angular/core';
import { logDemoEvent } from '../event-log';

/**
 * Says whether the nodes around it belong to Angular yet.
 *
 * The server renders the "not hydrated" text, and the browser shows it until
 * Angular hydrates this component. `afterNextRender` only runs in the browser,
 * once the component is live, so the text changes the moment that happens.
 */
@Component({
  selector: 'demo-hydration-status',
  template: `
    @if (hydratedAt(); as at) {
      <p class="status status--hydrated">
        <strong>Hydrated at {{ at }} ms.</strong>
        Angular owns these nodes now, so they respond to events.
        <button class="pb-btn pb-btn-ghost" type="button" (click)="clicks.set(clicks() + 1)">
          Clicked {{ clicks() }} {{ clicks() === 1 ? 'time' : 'times' }}
        </button>
      </p>
    } @else {
      <p class="status status--server">
        <strong>Server HTML, not hydrated yet.</strong>
        {{ waiting() }}
      </p>
    }
  `,
})
export class HydrationStatus {
  /** Used in the event log. */
  readonly name = input.required<string>();
  /** What the block is waiting for before Angular takes it over. */
  readonly waiting = input('Nothing here responds to events until Angular hydrates it.');

  protected readonly hydratedAt = signal<number | null>(null);
  protected readonly clicks = signal(0);

  constructor() {
    afterNextRender(() => {
      this.hydratedAt.set(Math.round(performance.now()));
      logDemoEvent('hydrate', `${this.name()} hydrated.`);
    });
  }
}
