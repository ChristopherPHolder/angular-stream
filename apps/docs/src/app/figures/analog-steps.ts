import { Component, computed, signal } from '@angular/core';
import { PIECES, RENDERERS, type Renderer, kilobytes } from './analog-recording';

/** Who owns a piece of the drawn page: the server's HTML, or Angular. */
type Owner = 'server' | 'hydrated';

/** A block: its loading state until its content is there. */
type BlockState = 'placeholder' | Owner;

/** One renderer's side of a step. */
interface Side {
  /** What happened, in a sentence or three. */
  text: string;
  /** How many pieces of its response have arrived by now. */
  sent: number;
  /** Everything outside the blocks. Null while the page does not have it. */
  shell: Owner | null;
  recommendations: BlockState;
  reviews: BlockState;
  /** What a click does at this point. */
  clicks: string;
}

interface Step {
  /** The label on the step's button. */
  short: string;
  /** When, as recorded. */
  at: string;
  title: string;
  analog: Side;
  here: Side;
}

const NOTHING_YET = 'Nothing answers a click.';

const STEPS: Step[] = [
  {
    short: 'First flush',
    at: '0.02 s',
    title: 'The first flush',
    analog: {
      text: 'The head, an inline runtime and an empty region go out before the app has rendered anything. Both blocks follow at once, in their loading state, and a script appends each to the region. The heading is not sent yet. The app’s script is preloaded, not run.',
      sent: 3,
      shell: null,
      recommendations: 'placeholder',
      reviews: 'placeholder',
      clicks: NOTHING_YET,
    },
    here: {
      text: 'The shell goes out: the page as it is without its data, the heading and both blocks where they belong, and the app’s script after them. The response stays open.',
      sent: 1,
      shell: 'server',
      recommendations: 'placeholder',
      reviews: 'placeholder',
      clicks: NOTHING_YET,
    },
  },
  {
    short: 'Script loaded',
    at: '0.02 s',
    title: 'The app’s script has loaded',
    analog: {
      text: 'Nothing changes. The script is in the browser’s cache, and it only runs once the final document is in.',
      sent: 3,
      shell: null,
      recommendations: 'placeholder',
      reviews: 'placeholder',
      clicks: NOTHING_YET,
    },
    here: {
      text: 'Angular hydrates the shell while the response is still open, and leaves the two blocks alone. On a real network this step comes as late as the script takes to download.',
      sent: 1,
      shell: 'hydrated',
      recommendations: 'placeholder',
      reviews: 'placeholder',
      clicks: 'The button under the heading answers.',
    },
  },
  {
    short: 'Reviews’ data',
    at: '0.3 s',
    title: 'The reviews API answers',
    analog: {
      text: 'Nothing is sent. A block goes out once, when it has rendered, and the reviews already did, in their loading state. Their data waits on the server for the rest of the page.',
      sent: 3,
      shell: null,
      recommendations: 'placeholder',
      reviews: 'placeholder',
      clicks: NOTHING_YET,
    },
    here: {
      text: 'The server renders the reviews again and sends them by themselves, with their data. A script swaps them in where their loading state was, on screen at 0.31 s. Angular hydrates that one block: it answers a click at 0.32 s.',
      sent: 2,
      shell: 'hydrated',
      recommendations: 'placeholder',
      reviews: 'hydrated',
      clicks: 'The button under the heading and the reviews answer.',
    },
  },
  {
    short: 'Recommendations’ data',
    at: '0.9 s',
    title: 'The recommendations API answers',
    analog: {
      text: 'The app is stable, so the whole document goes out: the head again, the heading, and both blocks with their data. A script replaces the body with it at 0.93 s, preview and all, and only then starts the app’s script.',
      sent: 4,
      shell: 'server',
      recommendations: 'server',
      reviews: 'server',
      clicks: NOTHING_YET,
    },
    here: {
      text: 'The recommendations arrive the same way and land above the reviews, which stay as they are: on screen at 0.91 s, answering a click at 0.92 s. Nothing else is coming, so the response ends.',
      sent: 3,
      shell: 'hydrated',
      recommendations: 'hydrated',
      reviews: 'hydrated',
      clicks: 'Everything answers.',
    },
  },
  {
    short: 'Hydrated',
    at: '0.95 s',
    title: 'Angular has the whole page',
    analog: {
      text: 'Angular hydrates the document it was just given, all of it in one go. The button under the heading answers a click at 0.94 s, and both blocks at 0.95 s.',
      sent: 4,
      shell: 'hydrated',
      recommendations: 'hydrated',
      reviews: 'hydrated',
      clicks: 'Everything answers.',
    },
    here: {
      text: 'Nothing is left to do. Each part was hydrated when its own data arrived, the reviews 0.6 s before the recommendations.',
      sent: 3,
      shell: 'hydrated',
      recommendations: 'hydrated',
      reviews: 'hydrated',
      clicks: 'Everything answers.',
    },
  },
];

const STATE_LABEL: Record<BlockState, string> = {
  placeholder: 'loading state',
  server: 'server HTML, not hydrated',
  hydrated: 'hydrated',
};

const ORDER: readonly Renderer[] = ['analog', 'here'];

/**
 * The `analog-steps` figure: one page sent through Analog's `renderStream()`
 * and through this library, a moment at a time. For each, what has arrived,
 * what the browser shows for it, and what answers a click. The times and sizes
 * are a recording (`analog-recording.ts`), not made up; the page's content is.
 *
 * It starts at the step where the two differ most, so the prerendered page
 * says something before any script runs.
 */
@Component({
  selector: 'docs-analog-steps',
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

    <!-- Not a heading: the figure can sit anywhere in a page's outline. -->
    <p class="moment text-title" aria-live="polite">
      <span class="at">{{ step().at }}</span> {{ step().title }}
    </p>

    <div class="lanes">
      @for (lane of lanes(); track lane.id) {
        <section class="lane" [attr.aria-label]="lane.name">
          <p class="lane-name text-card-title">{{ lane.name }}</p>
          <p class="lane-text">{{ lane.side.text }}</p>

          <div class="group">
            <p class="text-subtitle group-title">What has arrived</p>
            <ol class="pieces">
              @for (piece of lane.pieces; track piece.what) {
                <li class="piece" [class.piece--new]="piece.isNew">
                  <span>{{ piece.what }}</span>
                  <span class="size">{{ piece.size }}</span>
                </li>
              } @empty {
                <li class="piece piece--none">Nothing yet.</li>
              }
            </ol>
          </div>

          <div class="group">
            <p class="text-subtitle group-title">What the browser shows</p>
            <div class="mock">
              @if (lane.side.shell; as shell) {
                <div class="mock-part" [class]="'mock-part mock-part--' + shell">
                  <span class="mock-label">Trail shoes</span>
                  <span class="mock-state">{{ label(shell) }}</span>
                  <span class="mock-bars" aria-hidden="true"></span>
                </div>
                @for (block of lane.blocks; track block.name) {
                  <div class="mock-part" [class]="'mock-part mock-part--' + block.state">
                    <span class="mock-label">{{ block.name }}</span>
                    <span class="mock-state">{{ label(block.state) }}</span>
                    <span class="mock-bars" aria-hidden="true"></span>
                  </div>
                }
              } @else {
                <p class="mock-missing">No heading: it comes with the final document.</p>
                <div class="preview">
                  <p class="preview-name">Preview region, replaced at the end</p>
                  @for (block of lane.blocks; track block.name) {
                    <div class="mock-part" [class]="'mock-part mock-part--' + block.state">
                      <span class="mock-label">{{ block.name }}</span>
                      <span class="mock-state">{{ label(block.state) }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <p class="clicks"><span class="clicks-name">Clicks:</span> {{ lane.side.clicks }}</p>
        </section>
      }
    </div>

    <p class="note">
      A recording, not a made-up timeline: the times and sizes are from one page loaded through
      both, on one machine. The page’s content is made up.
    </p>
  `,
  styleUrl: './analog-steps.css',
})
export class AnalogSteps {
  protected readonly steps = STEPS;
  protected readonly index = signal(2);
  protected readonly step = computed(() => STEPS[this.index()]);

  /** The two renderers at this step: what each has sent, and what its page holds. */
  protected readonly lanes = computed(() => {
    const step = this.step();
    const before = this.index() === 0 ? undefined : STEPS[this.index() - 1];
    return ORDER.map((id) => {
      const side = step[id];
      const sentBefore = before?.[id].sent ?? 0;
      return {
        id,
        name: RENDERERS[id],
        side,
        pieces: PIECES[id].slice(0, side.sent).map((piece, i) => ({
          what: piece.what,
          size: kilobytes(piece.bytes),
          isNew: i >= sentBefore,
        })),
        // Top to bottom, as the page holds them.
        blocks: [
          { name: 'Recommendations', state: side.recommendations },
          { name: 'Reviews', state: side.reviews },
        ],
      };
    });
  });

  protected label(state: BlockState): string {
    return STATE_LABEL[state];
  }
}
