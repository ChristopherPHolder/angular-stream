import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { AnalogSteps } from '../figures/analog-steps';
import { AnalogTimeline } from '../figures/analog-timeline';
import { FIGURES, type FigureName } from '../figures/names';
import { Race } from '../figures/race';
import { ResponsePlayer } from '../figures/response-player';
import { REPO } from '../links';
import type { ResolvedDoc } from './doc.resolver';
import { headlineOf, referenceOf, setupsOf } from './nav';

@Component({
  selector: 'docs-page',
  templateUrl: './doc-page.html',
  imports: [AnalogSteps, AnalogTimeline, NgTemplateOutlet, Race, ResponsePlayer, RouterLink],
})
export class DocPage {
  readonly doc = input.required<ResolvedDoc>();

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * The page, top to bottom: its rendered Markdown, cut where a figure goes.
   * The HTML was rendered at build time from Markdown in this repository, so
   * it is trusted.
   */
  protected readonly parts = computed((): Part[] =>
    this.doc()
      .html.split(FIGURE)
      .map((piece, index) =>
        // `split` with a capture group: every second piece is a figure's name.
        index % 2 === 1
          ? { figure: piece as FigureName }
          : { html: this.sanitizer.bypassSecurityTrustHtml(piece) },
      ),
  );

  /** The heading: the page's name with nothing next to it to explain it. */
  protected readonly headline = computed(() => headlineOf(this.doc().page));

  protected readonly editUrl = computed(
    () =>
      `${REPO}/edit/main/apps/docs/src/content/${this.doc().page.dir}/${this.doc().page.slug}.md`,
  );

  protected readonly repo = REPO;

  /** On a runtime's setup page: the API page of what it installs. */
  protected readonly reference = computed(() => {
    const runtime = this.doc().page.runtime;
    return runtime === undefined ? undefined : referenceOf(runtime);
  });

  /** On an API page: the setup pages that use the package. */
  protected readonly setups = computed(() => setupsOf(this.doc().page));

  /** The id of the heading being read, which the outline marks. */
  protected readonly current = signal<string | undefined>(undefined);

  /** Said to a screen reader after a copy; the button's own text changes for everyone else. */
  protected readonly status = signal('');

  constructor() {
    // Sequence diagrams are drawn in the browser, on the pages that have one.
    afterRenderEffect(() => {
      this.doc();
      const diagrams = this.host.nativeElement.querySelectorAll<HTMLElement>(
        'pre.mermaid:not([data-processed])',
      );
      if (diagrams.length > 0) {
        void drawDiagrams(diagrams);
      }
    });

    // The outline follows the page: the last heading that has passed the header.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (!view) {
        return;
      }
      let frame = 0;
      const update = (): void => {
        frame = 0;
        this.current.set(this.headingInView());
      };
      const onScroll = (): void => {
        frame ||= view.requestAnimationFrame(update);
      };
      view.addEventListener('scroll', onScroll, { passive: true });
      view.addEventListener('resize', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        view.removeEventListener('scroll', onScroll);
        view.removeEventListener('resize', onScroll);
        view.cancelAnimationFrame(frame);
      });
    });
    // Another page, other headings.
    afterRenderEffect(() => {
      this.doc();
      this.current.set(this.headingInView());
    });
  }

  /** Clicks in the rendered Markdown: its links, and the copy button of a code block. */
  protected onProseClick(event: MouseEvent): void {
    const button = (event.target as Element | null)?.closest<HTMLElement>('.code-copy');
    if (button) {
      void this.copy(button);
    } else {
      this.followLink(event);
    }
  }

  private async copy(button: HTMLElement): Promise<void> {
    const code = button.closest('.code')?.querySelector('code');
    if (!code) {
      return;
    }
    let copied = true;
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(code.textContent ?? '');
    } catch {
      // No clipboard access, as on a page served without HTTPS: select the code instead.
      copied = false;
      this.document.defaultView?.getSelection()?.selectAllChildren(code);
    }
    button.textContent = copied ? 'Copied' : 'Selected';
    this.status.set(copied ? 'Code copied' : 'Code selected: copy it with your keyboard');
    this.document.defaultView?.setTimeout(() => {
      button.textContent = 'Copy';
      // Emptied, so the next copy is a change and is announced again.
      this.status.set('');
    }, COPIED_FOR);
  }

  /**
   * The id of the last `h2` or `h3` above the reading line, which is a little
   * below the sticky header; none while the page's first heading is still
   * further down, and the last one at the end of the page.
   */
  private headingInView(): string | undefined {
    const view = this.document.defaultView;
    if (!view) {
      return undefined;
    }
    const headings = this.host.nativeElement.querySelectorAll<HTMLElement>(
      '.prose h2[id], .prose h3[id]',
    );
    // At the end of the page the last sections are too short to reach the line.
    const root = this.document.documentElement;
    if (view.scrollY > 0 && view.innerHeight + view.scrollY >= root.scrollHeight - 2) {
      return headings[headings.length - 1]?.id;
    }
    const header = this.document.querySelector<HTMLElement>('.top')?.offsetHeight ?? 0;
    let current: string | undefined;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > header + READING_LINE) {
        break;
      }
      current = heading.id;
    }
    return current;
  }

  /** The folded outline closes once a heading is picked, so the heading is what shows. */
  protected closeOnLink(event: Event, outline: HTMLDetailsElement): void {
    if ((event.target as Element | null)?.closest('a')) {
      outline.open = false;
    }
  }

  /**
   * Links in the rendered Markdown are plain anchors, relative to the base
   * href. Ones that stay on the site go through the router instead of
   * reloading the page.
   */
  protected followLink(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest('a');
    // A `download` link is a file of the press kit, not a page.
    if (!anchor || anchor.target !== '' || anchor.hasAttribute('download')) {
      return;
    }
    const url = new URL(anchor.href);
    const base = new URL(this.document.baseURI);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      return;
    }
    event.preventDefault();
    const path = url.pathname.slice(base.pathname.length - 1);
    void this.router.navigateByUrl(path + url.hash);
  }
}

/** A stretch of the page's HTML, or the figure that stands between two of them. */
type Part = { figure: FigureName; html?: undefined } | { figure?: undefined; html: SafeHtml };

/** The line a page places a figure with, as the Markdown renderer passes it on. */
const FIGURE = new RegExp(`<!-- figure (${FIGURES.join('|')}) -->\\n?`);

/** How far below the sticky header a heading counts as reached, in pixels. */
const READING_LINE = 40;

/** How long a copy button says "Copied", in milliseconds. */
const COPIED_FOR = 2000;

async function drawDiagrams(nodes: NodeListOf<HTMLElement>): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    fontFamily: 'Geist, sans-serif',
  });
  await mermaid.run({ nodes });
}
