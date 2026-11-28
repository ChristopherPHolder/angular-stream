import { Component, signal } from '@angular/core';

/**
 * The parts of the made-up page, top to bottom, in the `race` figure's order:
 * the slowest part is in the middle, so the streamed page fills, and hydrates,
 * out of order. A part that waits for data has a placeholder in the streamed page
 * until it lands.
 */
const PARTS = [
  { id: 'product', label: 'Product', waits: false },
  { id: 'recommendations', label: 'Recommendations', waits: true },
  { id: 'reviews', label: 'Reviews', waits: true },
];

/**
 * The home page's hero: one product page sent whole and streamed, on one
 * clock. A drawing, not a measurement: the product renders at once, the reviews
 * take one second and the recommendations three, the times of the `race`
 * figure (`figures/race.ts`) in "Why stream out of order". A part lands as
 * server HTML, and Angular hydrates it half a second later: the whole page in
 * one go when it was sent whole, a part at a time when it was streamed, the
 * reviews at the bottom before the recommendations above them.
 *
 * It is all CSS (`styles.css`, "The hero's animation"), so it plays in the
 * prerendered page before Angular is there. It loops, so it can be paused; a
 * reader who asked for reduced motion gets the frame at 1.25 s, standing still.
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
                <span class="race-face race-html">{{ part.label }}<small>HTML</small></span>
                <span class="race-face race-hydrated">{{ part.label }}<small>hydrated</small></span>
              </span>
            }
          </div>
        </div>
        <div class="race-lane">
          <p class="race-name">Streamed</p>
          <div class="race-page race-page--streamed">
            @for (part of parts; track part.id) {
              <span class="race-part" [class]="'race-part--' + part.id">
                @if (part.waits) {
                  <span class="race-face race-loading">{{ part.label }}<small>loading</small></span>
                }
                <span class="race-face race-html">{{ part.label }}<small>HTML</small></span>
                <span class="race-face race-hydrated">{{ part.label }}<small>hydrated</small></span>
              </span>
            }
          </div>
        </div>
      </div>
      <div class="race-clock" aria-hidden="true">
        <span class="race-track"><span class="race-elapsed"></span></span>
        <span class="race-ticks"
          ><span>0 s</span><span>1 s</span><span>2 s</span><span>3 s</span><span>4 s</span></span
        >
      </div>
      <figcaption>
        <span>
          One page, sent both ways, on one clock.
          <span class="visually-hidden">
            Sent whole, the page is blank for three seconds, then all of it is there as HTML, and
            half a second later Angular hydrates all of it at once. Streamed, the product at the top
            is there at once, the reviews at the bottom after one second and the recommendations
            between them after three, and Angular hydrates each of them half a second after it
            lands.
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
