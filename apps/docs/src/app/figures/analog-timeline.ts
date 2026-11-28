import { Component } from '@angular/core';
import {
  MOMENTS,
  RECOMMENDATIONS_DATA_AT,
  RENDERERS,
  REVIEWS_DATA_AT,
  type Renderer,
  seconds,
} from './analog-recording';

/** The right end of every bar's scale, in seconds: just past the last moment. */
const SCALE = 1;

const ORDER: readonly Renderer[] = ['analog', 'here'];

const ROWS = MOMENTS.map((moment) => ({
  what: moment.what,
  note: moment.note,
  bars: ORDER.map((id) => ({
    id,
    name: RENDERERS[id],
    value: seconds(moment[id]),
    share: moment[id] / SCALE,
  })),
}));

/**
 * The `analog-timeline` figure: when each part of the page was on screen, and
 * when it answered a click, through Analog's `renderStream()` and through this
 * library. One bar per renderer, from the request to the moment, so a shorter
 * bar is sooner. This library's bars are in the accent colour and Analog's in
 * grey; every bar carries its name and its value, so the colour says nothing
 * the text does not.
 *
 * The numbers are a recording (`analog-recording.ts`). The page prints them as
 * a table too.
 */
@Component({
  selector: 'docs-analog-timeline',
  host: {
    '[style.--reviews-data]': 'reviewsDataAt',
    '[style.--recommendations-data]': 'recommendationsDataAt',
  },
  template: `
    <!-- Not a heading: the figure can sit anywhere in a page's outline. -->
    <p class="title text-card-title">Seconds from the request until each thing was true</p>
    <ul class="legend">
      <li><span class="swatch swatch--analog" aria-hidden="true"></span>{{ names.analog }}</li>
      <li><span class="swatch swatch--here" aria-hidden="true"></span>{{ names.here }}</li>
      <li>
        <span class="swatch swatch--line" aria-hidden="true"></span>An API answered on the server:
        the reviews at {{ reviewsAt }}, the recommendations at {{ recommendationsAt }}
      </li>
    </ul>

    <ul class="rows">
      @for (row of rows; track row.what) {
        <li class="row">
          <p class="what">
            {{ row.what }} <span class="row-note">{{ row.note }}</span>
          </p>
          <dl class="bars">
            @for (bar of row.bars; track bar.id) {
              <div class="bar" [class]="'bar bar--' + bar.id">
                <dt>{{ bar.name }}</dt>
                <dd class="plot" [style.--share]="bar.share">
                  <span class="fill" aria-hidden="true"></span>
                  <span class="value">{{ bar.value }}</span>
                </dd>
              </div>
            }
          </dl>
        </li>
      }
    </ul>

    <p class="note">
      Shorter is sooner. Medians of five loads in Chrome, with both servers on the same machine: the
      gaps are what carry over, not the numbers.
    </p>
  `,
  styleUrl: './analog-timeline.css',
})
export class AnalogTimeline {
  protected readonly rows = ROWS;
  protected readonly names = RENDERERS;
  protected readonly reviewsDataAt = REVIEWS_DATA_AT / SCALE;
  protected readonly recommendationsDataAt = RECOMMENDATIONS_DATA_AT / SCALE;
  protected readonly reviewsAt = `${REVIEWS_DATA_AT} s`;
  protected readonly recommendationsAt = `${RECOMMENDATIONS_DATA_AT} s`;
}
