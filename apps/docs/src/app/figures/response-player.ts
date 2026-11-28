import { Component, computed, signal } from '@angular/core';
import { CodeSample, type Sample } from './code-sample';

/** Who owns a piece of the drawn page at a step. */
type Owner = 'server' | 'hydrated';

/** A slow part of the page: its placeholder until its chunk arrives. */
type BlockState = 'placeholder' | Owner;

interface Step {
  /** The label on the step's button. */
  short: string;
  title: string;
  text: string;
  /** Which pieces of the response have been sent by this step. */
  sent: number;
  /** Null until the shell has arrived. */
  shell: Owner | null;
  recommendations: BlockState;
  reviews: BlockState;
}

/**
 * The response, in the three pieces the server writes. Cut down to what does
 * the work. The recommendations sit above the reviews, so they are met first
 * and get `d0`; the reviews are `d1`, and arrive first.
 */
const PIECES = [
  `<!doctype html>
<html>
<body>
  <h1>Trail shoes</h1>
  <section>
    <p>Loading recommendations…</p>
    <!--ngh=d0-->
  </section>
  <section>
    <p>Loading reviews…</p>
    <!--ngh=d1-->
  </section>
  <script>/* the inline runtime: window.__ngs */</script>
  <script type="module" src="main.js" async></script>`,
  `  <template data-ngs="d1">
    <app-reviews>…</app-reviews>
  </template>
  <script>
    __ngs.push({
      // The template for d1, and its hydration data.
      b: [{ id: 'd1', … }],
      // The reviews API's answer, for the browser's request.
      s: { … },
      // Still on its way: the recommendations.
      p: [ … ],
    });
  </script>`,
  `  <template data-ngs="d0">
    <app-recommendations>…</app-recommendations>
  </template>
  <script>
    __ngs.push({
      b: [{ id: 'd0', … }],
      s: { … },
      // Nothing else is coming.
      done: true,
    });
  </script>
</body>
</html>`,
];

const STEPS: Step[] = [
  {
    short: 'Request',
    title: 'The browser asks for the page',
    text: 'The server starts rendering. The page has two parts that wait for an API: recommendations, which take 3 seconds, and below them reviews, which take 1. Nothing has been sent yet.',
    sent: 0,
    shell: null,
    recommendations: 'placeholder',
    reviews: 'placeholder',
  },
  {
    short: 'Shell',
    title: 'The server sends what it has',
    text: 'After 0.1 seconds, everything that does not wait for data goes out, with a placeholder for each slow part. A comment marks each spot, a small inline script will deal with what follows, and the app’s own script comes last. The response stays open.',
    sent: 1,
    shell: 'server',
    recommendations: 'placeholder',
    reviews: 'placeholder',
  },
  {
    short: 'Angular starts',
    title: 'Angular starts on what is there',
    text: 'The app’s script has loaded. Angular hydrates the shell, so the page responds to clicks while both slow parts are still loading. It leaves the two placeholders alone.',
    sent: 1,
    shell: 'hydrated',
    recommendations: 'placeholder',
    reviews: 'placeholder',
  },
  {
    short: 'Reviews arrive',
    title: 'The reviews arrive first, out of order',
    text: 'After 1 second the reviews API answers. The reviews sit lower on the page, but they do not wait for the recommendations above them: the server sends them at once, as markup in a template and a script that moves it in front of d1’s comment. The script also hands over the API’s answer, and says the recommendations are still on their way.',
    sent: 2,
    shell: 'hydrated',
    recommendations: 'placeholder',
    reviews: 'server',
  },
  {
    short: 'Reviews hydrate',
    title: 'Angular takes the reviews over, and only them',
    text: 'The data is what the reviews were waiting for, so Angular hydrates that block on its own, against the markup already on the page. It renders nothing again and sends no request. The recommendations stay a placeholder that Angular does not touch.',
    sent: 2,
    shell: 'hydrated',
    recommendations: 'placeholder',
    reviews: 'hydrated',
  },
  {
    short: 'Recommendations arrive',
    title: 'The recommendations arrive last',
    text: 'After 3 seconds the recommendations API answers. The server sends them down the same response, and the script puts them in front of d0’s comment, above the reviews, which are already hydrated and stay as they are. Nothing else is coming, so the response ends.',
    sent: 3,
    shell: 'hydrated',
    recommendations: 'server',
    reviews: 'hydrated',
  },
  {
    short: 'Recommendations hydrate',
    title: 'Angular takes the recommendations over',
    text: 'Their data has come with them, so the last block hydrates too. Each part became usable when its own data arrived, in the order the APIs answered, not the order of the page.',
    sent: 3,
    shell: 'hydrated',
    recommendations: 'hydrated',
    reviews: 'hydrated',
  },
];

const TOTAL_LINES = PIECES.join('\n').split('\n').length;

/** The heading over the response, by how many pieces have been sent. */
const FILE_LABELS = [
  'The response: nothing sent yet',
  'The response: still open',
  'The response: still open',
  'The response: complete',
];

const OWNER_LABEL: Record<Owner, string> = {
  server: 'server HTML, not hydrated',
  hydrated: 'hydrated',
};

/**
 * The `response` figure: one page load, a step at a time. What has come down
 * the response so far, and what the browser shows for it. Two slow parts
 * arrive in the order their data does, not the order of the page, and each
 * hydrates on its own. A drawing of the mechanism, with made-up content; the
 * demo does it for real.
 *
 * The response is hand-written above: if the wire format changes, change it
 * here too.
 */
@Component({
  selector: 'docs-response-player',
  template: `
    <div class="bar">
      <ol class="step-list">
        @for (item of steps; track item.short; let i = $index) {
          <li>
            <button
              class="pb-btn pb-btn-ghost"
              type="button"
              [attr.aria-current]="i === index() ? 'step' : null"
              (click)="index.set(i)"
            >
              {{ i + 1 }} · {{ item.short }}
            </button>
          </li>
        }
      </ol>
      <div class="arrows">
        <button
          class="pb-btn pb-btn-ghost"
          type="button"
          [disabled]="index() === 0"
          (click)="index.set(index() - 1)"
        >
          Back
        </button>
        <button
          class="pb-btn pb-btn-primary"
          type="button"
          [disabled]="index() === steps.length - 1"
          (click)="index.set(index() + 1)"
        >
          Next
        </button>
      </div>
    </div>

    <div class="caption" aria-live="polite">
      <!-- Not a heading: the figure can sit anywhere in a page's outline. -->
      <p class="caption-title text-title">{{ step().title }}</p>
      <p>{{ step().text }}</p>
    </div>

    <div class="panes">
      <div class="pane">
        <p class="text-subtitle pane-title">What the server has sent</p>
        <docs-code [sample]="wire()" />
        <p class="legend"><span class="legend-swatch"></span> arrived in this step</p>
      </div>
      <div class="pane pane--page">
        <p class="text-subtitle pane-title">What the browser shows</p>
        <div class="mock">
          @if (step().shell; as shell) {
            <div class="mock-part" [class]="'mock-part mock-part--' + shell">
              <span class="mock-label">Trail shoes</span>
              <span class="mock-state">{{ label(shell) }}</span>
              <span class="mock-bars" aria-hidden="true"></span>
            </div>
            @for (block of blocks(); track block.name) {
              <div class="mock-part" [class]="'mock-part mock-part--' + block.state">
                @if (block.state === 'placeholder') {
                  <span class="mock-label">Loading {{ block.name }}…</span>
                  <span class="mock-state">placeholder · {{ block.id }}</span>
                } @else {
                  <span class="mock-label">{{ block.title }}</span>
                  <span class="mock-state">{{ label(block.state) }} · {{ block.id }}</span>
                  <span class="mock-bars" aria-hidden="true"></span>
                  <span class="mock-bars" aria-hidden="true"></span>
                }
              </div>
            }
          } @else {
            <p class="mock-empty">Blank page</p>
          }
        </div>
      </div>
    </div>
  `,
  styleUrl: './response-player.css',
  imports: [CodeSample],
})
export class ResponsePlayer {
  protected readonly steps = STEPS;
  protected readonly index = signal(0);
  protected readonly step = computed(() => STEPS[this.index()]);

  /** The slow parts, top to bottom, as the page holds them at this step. */
  protected readonly blocks = computed(() => {
    const step = this.step();
    return [
      {
        id: 'd0',
        name: 'recommendations',
        title: 'Recommendations',
        state: step.recommendations,
      },
      { id: 'd1', name: 'reviews', title: 'Reviews', state: step.reviews },
    ];
  });

  /**
   * The response as far as it has come: only what has been sent is shown, and
   * what this step added is marked. The frame keeps room for all of it.
   */
  protected readonly wire = computed((): Sample => {
    const { sent } = this.step();
    const before = this.index() === 0 ? 0 : STEPS[this.index() - 1].sent;
    const upTo = (pieces: number) => PIECES.slice(0, pieces).join('\n');
    return {
      file: FILE_LABELS[sent],
      code: upTo(sent),
      empty: 'Nothing has arrived yet.',
      newFrom: sent > before ? (before === 0 ? 0 : upTo(before).split('\n').length) : undefined,
      minLines: TOTAL_LINES,
    };
  });

  protected label(owner: Owner): string {
    return OWNER_LABEL[owner];
  }
}
