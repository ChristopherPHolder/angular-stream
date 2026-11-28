import { Component, signal } from '@angular/core';

/** The parts of the made-up page, top to bottom. */
const PARTS = [
  { id: 'product', label: 'Product' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'recommendations', label: 'Recommendations' },
];

/**
 * The home page's hero: one product page sent whole and streamed, on one
 * clock. A drawing, not a measurement: the product renders at once, the reviews
 * take one second and the recommendations three, the times of the `race`
 * figure (`figures/race.ts`) in "Why stream out of order".
 *
 * It is all CSS (`styles.css`, "The hero's animation"), so it plays in the
 * prerendered page before Angular is there. It loops, so it can be paused; a
 * reader who asked for reduced motion gets the frame at 1.5 s, standing still.
 */
@Component({
  selector: 'docs-home-race',
  template: `
    <figure class="race" [class.race--paused]="paused()">
      <!-- The picture is described in the caption; its labels would only repeat it. -->
      <div class="race-lanes" aria-hidden="true">
        <div class="race-lane">
          <p class="race-name">Sent whole</p>
          <div class="race-page race-page--whole">
            <span class="race-blank">Blank page</span>
            @for (part of parts; track part.id) {
              <span class="race-part" [class]="'race-part--' + part.id">
                <span class="race-ready">{{ part.label }}<i></i></span>
              </span>
            }
          </div>
        </div>
        <div class="race-lane">
          <p class="race-name">Streamed</p>
          <div class="race-page race-page--streamed">
            @for (part of parts; track part.id) {
              <span class="race-part" [class]="'race-part--' + part.id">
                <span class="race-loading">{{ part.label }}</span>
                <span class="race-ready">{{ part.label }}<i></i></span>
              </span>
            }
          </div>
        </div>
      </div>
      <div class="race-clock" aria-hidden="true">
        <span class="race-track"><span class="race-elapsed"></span></span>
        <span class="race-ticks"
          ><span>0 s</span><span>1 s</span><span>2 s</span><span>3 s</span></span
        >
      </div>
      <figcaption>
        <span>
          One page, sent both ways, on one clock.
          <span class="visually-hidden">
            Sent whole, the page is blank for three seconds, then all of it is there. Streamed, the
            product is there at once, the reviews after one second and the recommendations after
            three.
          </span>
          A drawing: the times are made up.
        </span>
        <button
          type="button"
          class="race-toggle pb-btn pb-btn-ghost"
          (click)="paused.set(!paused())"
        >
          {{ paused() ? 'Play' : 'Pause' }}<span class="visually-hidden"> the animation</span>
        </button>
      </figcaption>
    </figure>
  `,
})
export class HomeRace {
  protected readonly parts = PARTS;
  protected readonly paused = signal(false);
}
