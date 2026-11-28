import { Component, computed, signal } from '@angular/core';
import { CodeSample, type Sample } from './code-sample';

/** Who owns a piece of the drawn page at a step. */
type Owner = 'server' | 'hydrated';

interface Step {
  /** The label on the step's button. */
  short: string;
  title: string;
  text: string;
  /** Which pieces of the response have been sent by this step. */
  sent: number;
  /** Null until the shell has arrived. */
  shell: Owner | null;
  reviews: 'placeholder' | Owner;
}

/** The response, in the two pieces the server writes. Cut down to what does the work. */
const PIECES = [
  `<!doctype html>
<html>
<body>
  <h1>Trail shoes</h1>
  <section>
    <p>Loading reviews…</p>
    <!--ngh=d0-->
  </section>
  <script>
    /* the inline runtime: window.__ngs */
  </script>
  <script type="module" src="main.js" async></script>`,
  `  <template data-ngs="d0">
    <app-reviews>…</app-reviews>
  </template>
  <script>
    __ngs.push({
      // The template for d0, and its hydration data.
      b: [{ id: 'd0', … }],
      // The API's answer, for the browser's request.
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
    text: 'The server starts rendering. The page shows reviews from an API, and that request takes a while. Nothing has been sent yet.',
    sent: 0,
    shell: null,
    reviews: 'placeholder',
  },
  {
    short: 'Shell',
    title: 'The server sends what it has',
    text: 'Everything that does not need the reviews goes out at once, with a placeholder where they will go. A comment marks the spot, a small inline script will deal with what follows, and the app’s own script comes last. The response stays open.',
    sent: 1,
    shell: 'server',
    reviews: 'placeholder',
  },
  {
    short: 'Angular starts',
    title: 'Angular starts on what is there',
    text: 'The app’s script has loaded. Angular hydrates the shell, so the page responds to clicks while the reviews are still loading. Nothing new has arrived.',
    sent: 1,
    shell: 'hydrated',
    reviews: 'placeholder',
  },
  {
    short: 'Reviews arrive',
    title: 'The reviews arrive as HTML',
    text: 'The API answered, so the server rendered the reviews and sent them down the same response: the markup in a template, then a script that moves it in front of the comment, in place of the placeholder. The script also hands over the API’s answer, so the browser never asks for it. This works the same if Angular has not started yet. Then the response ends.',
    sent: 2,
    shell: 'hydrated',
    reviews: 'server',
  },
  {
    short: 'Reviews hydrate',
    title: 'Angular takes the reviews over',
    text: 'The data is what the block was waiting for. Angular hydrates the markup that is already on the page. It renders nothing again and sends no request.',
    sent: 2,
    shell: 'hydrated',
    reviews: 'hydrated',
  },
];

const TOTAL_LINES = PIECES.join('\n').split('\n').length;

/** The heading over the response, by how many pieces have been sent. */
const FILE_LABELS = [
  'The response: nothing sent yet',
  'The response: still open',
  'The response: complete',
];

const OWNER_LABEL: Record<Owner, string> = {
  server: 'server HTML, not hydrated',
  hydrated: 'hydrated',
};

/**
 * The `response` figure: one page load, a step at a time. What has come down
 * the response so far, and what the browser shows for it. A drawing of the
 * mechanism, with made-up content; the demo does it for real.
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
            @let reviews = step().reviews;
            <div class="mock-part" [class]="'mock-part mock-part--' + reviews">
              @if (reviews === 'placeholder') {
                <span class="mock-label">Loading reviews…</span>
                <span class="mock-state">placeholder</span>
              } @else {
                <span class="mock-label">Reviews</span>
                <span class="mock-state">{{ label(reviews) }}</span>
                <span class="mock-bars" aria-hidden="true"></span>
                <span class="mock-bars" aria-hidden="true"></span>
              }
            </div>
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
