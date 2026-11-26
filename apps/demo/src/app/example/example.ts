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
import { CodeSample } from '../code-sample';
import { COMPONENT, CONFIG, TEMPLATE, WORKER } from './samples';
import { Widget } from './widget';

/**
 * How long the browser waits, once the widget's HTML is in, before letting
 * Angular hydrate it. Without the pause hydration follows about a millisecond
 * after the HTML lands, and the two steps look like one.
 */
export const HYDRATION_PAUSE_MS = 2000;

/**
 * The idea, live: the shell first, the widget about five seconds later, then
 * its hydration. Below it, the least code that does the same.
 */
@Component({
  selector: 'demo-example',
  templateUrl: './example.html',
  styleUrl: './example.css',
  imports: [CodeSample, Widget],
})
export class Example {
  protected readonly samples = {
    template: TEMPLATE,
    component: COMPONENT,
    config: CONFIG,
    worker: WORKER,
  };

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

  /** A time from the event log, or that it has not happened yet. */
  protected ms(at: number | null): string {
    return at === null ? 'waiting' : `${at} ms`;
  }

  private firstEvent(match: (event: { kind: string; text: string }) => boolean) {
    return computed(() => this.events().find(match)?.at ?? null);
  }
}
