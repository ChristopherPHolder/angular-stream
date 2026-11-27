import { Component, computed, input } from '@angular/core';

/** A piece of code shown on a page. */
export interface Sample {
  /** The file it would live in, or what it is, shown above the code. */
  file: string;
  code: string;
  /** Lines containing any of these are marked as the ones that matter. */
  key?: readonly string[];
  /** Lines from this index on are marked too, and fade in: the part that just arrived. */
  newFrom?: number;
  /** Shown in place of the code while there is none. */
  empty?: string;
  /** Room to keep for this many lines, so code that grows moves nothing around it. */
  minLines?: number;
}

/**
 * A code sample with its file name, the lines that matter marked.
 *
 * Each line is its own block with `white-space: pre`, rather than one `<pre>`,
 * so the template can be formatted without changing what is shown.
 */
@Component({
  selector: 'demo-code',
  template: `
    <figure>
      <figcaption>{{ sample().file }}</figcaption>
      <!-- Focusable, so a sample that scrolls sideways can be scrolled from the keyboard. -->
      <div
        class="scroll"
        tabindex="0"
        role="group"
        [attr.aria-label]="sample().file"
        [style.min-height]="minHeight()"
      >
        @if (lines().length === 0) {
          <p class="empty">{{ sample().empty }}</p>
        } @else {
          <code>
            @for (line of lines(); track $index) {
              <span
                class="line"
                [class.line--key]="line.key"
                [class.line--new]="line.fresh"
                [class.line--comment]="line.comment"
                >{{ line.text }}</span
              >
            }
          </code>
        }
      </div>
    </figure>
  `,
  styleUrl: './code-sample.css',
})
export class CodeSample {
  readonly sample = input.required<Sample>();

  protected readonly lines = computed(() => {
    const { code, key = [], newFrom = Infinity } = this.sample();
    if (code === '') {
      return [];
    }
    return code.split('\n').map((text, index) => ({
      text,
      fresh: index >= newFrom,
      key: index >= newFrom || key.some((part) => text.includes(part)),
      comment: /^\s*(\/\/|<!--)/.test(text),
    }));
  });

  /** The height of `minLines` lines, in the lines' own line-height. */
  protected readonly minHeight = computed(() => {
    const lines = this.sample().minLines;
    return lines === undefined ? null : `calc(${lines} * var(--line))`;
  });
}
