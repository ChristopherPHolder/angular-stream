import {
  Component,
  DOCUMENT,
  type ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ALL_PAGES } from '../docs/nav';
import { type SearchResult, type SearchSection, SHORTEST_QUERY, find } from './find';

/**
 * Search over every page, in a dialog the header's button, `/` and Ctrl/Cmd+K
 * open. The index is a chunk of its own, downloaded on the first search.
 *
 * The field is a combobox over the list of results: the arrow keys move
 * through them without leaving the field, and Enter goes to the one marked.
 */
@Component({
  selector: 'docs-search',
  template: `
    <button
      type="button"
      class="search-open pb-btn pb-btn-ghost"
      aria-haspopup="dialog"
      (click)="open()"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3.5 3.5" />
      </svg>
      <span class="search-open-label">Search</span>
      <kbd aria-hidden="true">/</kbd>
    </button>
    <dialog class="search" aria-label="Search the docs" (close)="closed()" #dialog>
      <div class="search-field">
        <input
          class="pb-input"
          type="text"
          inputmode="search"
          enterkeyhint="search"
          role="combobox"
          aria-label="Search the docs"
          aria-autocomplete="list"
          aria-controls="search-results"
          [attr.aria-expanded]="results().length > 0"
          [attr.aria-activedescendant]="results().length > 0 ? 'search-result-' + active() : null"
          placeholder="Search the docs"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          [value]="query()"
          (input)="typed($event)"
          (keydown)="pressed($event)"
          #field
        />
        <button type="button" class="pb-btn pb-btn-ghost" (click)="dialog.close()">Close</button>
      </div>
      <p class="search-status" role="status">{{ status() }}</p>
      <ul id="search-results" class="search-results" role="listbox" aria-label="Results">
        @for (result of results(); track result.section; let index = $index) {
          <li
            role="option"
            [id]="'search-result-' + index"
            [class.search-active]="index === active()"
            [attr.aria-selected]="index === active()"
            (click)="go(result)"
            (pointermove)="active.set(index)"
          >
            <span class="search-where text-subtitle">{{ result.section.page.section.title }}</span>
            <span class="search-title">
              {{ result.section.page.title }}
              @if (result.section.heading) {
                <span aria-hidden="true">›</span> {{ result.section.heading }}
              }
            </span>
            <span class="search-snippet">
              @for (part of result.snippet; track $index) {
                @if (part.hit) {
                  <mark>{{ part.text }}</mark>
                } @else {
                  {{ part.text }}
                }
              }
            </span>
          </li>
        }
      </ul>
    </dialog>
  `,
  host: { '(document:keydown)': 'shortcut($event)' },
})
export class DocsSearch {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly query = signal('');

  /** The index, once it has been downloaded. */
  private readonly sections = signal<SearchSection[] | undefined>(undefined);

  protected readonly results = computed<SearchResult[]>(() =>
    find(this.sections() ?? [], this.query()),
  );

  /** The result the arrow keys are on, which Enter goes to. */
  protected readonly active = signal(0);

  /** Read to a screen reader as it changes, and shown under the field. */
  protected readonly status = computed(() => {
    if (this.query().trim().length < SHORTEST_QUERY) {
      return 'Type at least two characters. Every page is searched, code included.';
    }
    if (this.sections() === undefined) {
      return 'Loading the index…';
    }
    const found = this.results().length;
    return found === 0
      ? `Nothing matches “${this.query().trim()}”.`
      : `${found} ${found === 1 ? 'section' : 'sections'}. Arrow keys to move, Enter to open.`;
  });

  protected open(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      return;
    }
    dialog.showModal();
    this.field().nativeElement.focus();
    void this.load();
  }

  /** `/` and Ctrl/Cmd+K, unless something is being typed into. */
  protected shortcut(event: KeyboardEvent): void {
    const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!combo && !(slash && !isTypingInto(event.target))) {
      return;
    }
    event.preventDefault();
    this.open();
  }

  protected typed(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected pressed(event: KeyboardEvent): void {
    const last = this.results().length - 1;
    if (last < 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        this.move(this.active() === last ? 0 : this.active() + 1);
        break;
      case 'ArrowUp':
        this.move(this.active() === 0 ? last : this.active() - 1);
        break;
      case 'Enter':
        this.go(this.results()[this.active()]);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected go(result: SearchResult | undefined): void {
    if (!result) {
      return;
    }
    const { page, id } = result.section;
    this.dialog().nativeElement.close();
    void this.router.navigateByUrl('/' + page.path + (id === '' ? '' : '#' + id)).then(() => {
      // Closing the dialog put the focus back on its button; the reader is on the page now.
      this.document.getElementById('content')?.focus({ preventScroll: true });
    });
  }

  /** Escape, the Close button, or a result picked. */
  protected closed(): void {
    this.query.set('');
    this.active.set(0);
  }

  private move(to: number): void {
    this.active.set(to);
    this.document.getElementById('search-result-' + to)?.scrollIntoView({ block: 'nearest' });
  }

  private async load(): Promise<void> {
    if (this.sections() !== undefined) {
      return;
    }
    const { default: entries } = await import('virtual:docs-search');
    const pages = new Map(ALL_PAGES.map((page) => [page.path, page]));
    this.sections.set(
      entries.flatMap((entry) => {
        const page = pages.get(entry.path);
        // A content file that isn't listed in the contents is not a page.
        return page === undefined
          ? []
          : [
              {
                page,
                id: entry.id,
                heading: entry.heading,
                text: entry.text,
                lower: {
                  title: page.title.toLowerCase(),
                  heading: entry.heading.toLowerCase(),
                  text: entry.text.toLowerCase(),
                },
              },
            ];
      }),
    );
  }
}

function isTypingInto(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element !== null &&
    (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
  );
}
