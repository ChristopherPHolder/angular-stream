import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

/** The made-up page load the visual plays, in milliseconds since the request. */
const SHELL_AT = 100;
const REVIEWS_AT = 1000;
const RECOMMENDATIONS_AT = 3000;
const END = 4000;
const TICK = 50;

type PartState = 'absent' | 'loading' | 'ready';

interface Strategy {
  name: string;
  how: string;
  /** When the reader first sees anything, and when the reviews can be read. */
  firstAt: number;
  reviewsAt: number;
  headerAt: number;
  recommendations: (t: number) => PartState;
  reviews: (t: number) => PartState;
}

const once = (at: number, before: PartState) => (t: number) => (t >= at ? 'ready' : before);

const STRATEGIES: Strategy[] = [
  {
    name: 'Wait for everything',
    how: 'The server renders the whole page, then sends it. Angular’s server rendering works this way.',
    firstAt: RECOMMENDATIONS_AT,
    reviewsAt: RECOMMENDATIONS_AT,
    headerAt: RECOMMENDATIONS_AT,
    recommendations: once(RECOMMENDATIONS_AT, 'absent'),
    reviews: once(RECOMMENDATIONS_AT, 'absent'),
  },
  {
    name: 'Stream in order',
    how: 'HTML goes out top to bottom as it is ready. A slow part holds back everything below it.',
    firstAt: SHELL_AT,
    reviewsAt: RECOMMENDATIONS_AT,
    headerAt: SHELL_AT,
    recommendations: once(RECOMMENDATIONS_AT, 'absent'),
    reviews: once(RECOMMENDATIONS_AT, 'absent'),
  },
  {
    name: 'Stream out of order',
    how: 'Everything that is ready goes out at once, with placeholders. Each is filled in when its data arrives.',
    firstAt: SHELL_AT,
    reviewsAt: REVIEWS_AT,
    headerAt: SHELL_AT,
    recommendations: once(RECOMMENDATIONS_AT, 'loading'),
    reviews: once(REVIEWS_AT, 'loading'),
  },
];

/**
 * The `race` figure: the same page sent three ways, on one clock. A drawing,
 * not a measurement: the times are fixed above, and nothing here makes a
 * request. The home page's hero (`home-race.ts`) plays the first and the last
 * lane with the same times; keep the two in step.
 *
 * It starts part way through, so the picture says something in the prerendered
 * page, before anyone presses play and with JavaScript off.
 */
@Component({
  selector: 'docs-race',
  template: `
    <div class="controls">
      <button class="pb-btn pb-btn-primary" type="button" (click)="toggle()">
        {{ playing() ? 'Pause' : 'Play from the start' }}
      </button>
      <label class="scrub">
        <span>Time since the request</span>
        <input
          #scrub
          type="range"
          min="0"
          [max]="end"
          step="100"
          [value]="t()"
          [attr.aria-valuetext]="seconds(t())"
          (input)="seek(scrub.valueAsNumber)"
        />
      </label>
      <span class="now">{{ seconds(t()) }}</span>
    </div>

    <ol class="lanes">
      @for (lane of lanes(); track lane.name) {
        <li class="lane">
          <!-- Not a heading: the figure can sit anywhere in a page's outline. -->
          <p class="lane-name text-card-title">{{ lane.name }}</p>
          <p class="how">{{ lane.how }}</p>
          <div class="mock">
            @if (lane.header) {
              <div class="mock-part">
                <span class="mock-label">Product</span>
                <span class="mock-bars" aria-hidden="true"></span>
              </div>
              @for (part of lane.parts; track part.label) {
                @if (part.state !== 'absent') {
                  <div class="mock-part" [class.mock-part--placeholder]="part.state === 'loading'">
                    <span class="mock-label">{{ part.label }}</span>
                    @if (part.state === 'loading') {
                      <span class="mock-state">loading</span>
                    } @else {
                      <span class="mock-bars" aria-hidden="true"></span>
                    }
                  </div>
                }
              }
            } @else {
              <p class="mock-empty">Blank page</p>
            }
          </div>
          <dl class="lane-facts">
            <div [class.reached]="t() >= lane.firstAt">
              <dt>First content</dt>
              <dd>{{ seconds(lane.firstAt) }}</dd>
            </div>
            <div [class.reached]="t() >= lane.reviewsAt">
              <dt>Reviews</dt>
              <dd>{{ seconds(lane.reviewsAt) }}</dd>
            </div>
          </dl>
        </li>
      }
    </ol>
    <p class="note">A drawing, not a measurement: the times are made up.</p>
  `,
  styleUrl: './race.css',
})
export class Race {
  protected readonly end = END;
  protected readonly t = signal(1200);
  protected readonly playing = signal(false);

  protected readonly lanes = computed(() => {
    const t = this.t();
    return STRATEGIES.map((strategy) => ({
      ...strategy,
      header: t >= strategy.headerAt,
      parts: [
        { label: 'Recommendations', state: strategy.recommendations(t) },
        { label: 'Reviews', state: strategy.reviews(t) },
      ],
    }));
  });

  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected toggle(): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    this.t.set(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      const next = Math.min(END, this.t() + TICK);
      this.t.set(next);
      if (next >= END) {
        this.stop();
      }
    }, TICK);
  }

  protected seek(t: number): void {
    this.stop();
    this.t.set(t);
  }

  protected seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)} s`;
  }

  private stop(): void {
    clearInterval(this.timer);
    this.playing.set(false);
  }
}
