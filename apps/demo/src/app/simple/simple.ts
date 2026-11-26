import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { STEP_DELAYS, type StepData } from '../demo-backend';
import { DemoEvents } from '../event-log';
import { SimpleWidget } from './simple-widget';

/**
 * How long the browser waits, once the widget's HTML is in, before letting
 * Angular hydrate it. Without the pause hydration follows about a millisecond
 * after the HTML lands, and the two steps look like one.
 */
export const HYDRATION_PAUSE_MS = 2000;

/** Shell first, the widget about five seconds later, then hydration. */
@Component({
  selector: 'demo-simple',
  templateUrl: './simple.html',
  styleUrl: './simple.css',
  imports: [SimpleWidget],
})
export class Simple {
  protected readonly delayMs = STEP_DELAYS.widget;
  protected readonly pauseMs = HYDRATION_PAUSE_MS;

  protected readonly widget = toSignal(
    inject(HttpClient).get<StepData>('/api/steps/widget', {
      params: { delay: this.delayMs },
    }),
  );

  /** The widget block's hydrate trigger: false on the server, and until the pause is over. */
  protected readonly hydrateNow = signal(false);

  private readonly events = inject(DemoEvents).events;
  protected readonly shellAt = this.firstEvent((e) => e.kind === 'shell');
  protected readonly widgetAt = this.firstEvent(
    (e) => e.kind === 'chunk' && e.text.includes('"Widget"'),
  );
  protected readonly hydratedAt = this.firstEvent((e) => e.text === 'Widget hydrated.');

  /** Seconds since the navigation started, until the widget has hydrated. */
  protected readonly elapsed = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      if (this.widget() !== undefined && timer === undefined) {
        timer = setTimeout(() => this.hydrateNow.set(true), HYDRATION_PAUSE_MS);
      }
    });

    const tick = setInterval(() => {
      this.elapsed.set((performance.now() / 1000).toFixed(1));
      if (this.hydratedAt() !== null) {
        clearInterval(tick);
      }
    }, 100);

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      clearInterval(tick);
    });
  }

  private firstEvent(match: (event: { kind: string; text: string }) => boolean) {
    return computed(() => this.events().find(match)?.at ?? null);
  }
}
