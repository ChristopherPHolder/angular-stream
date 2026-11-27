import {
  Component,
  DOCUMENT,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { REPO } from '../links';
import type { ResolvedDoc } from './doc.resolver';

@Component({
  selector: 'docs-page',
  templateUrl: './doc-page.html',
  imports: [RouterLink],
})
export class DocPage {
  readonly doc = input.required<ResolvedDoc>();

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);

  /** Rendered at build time from Markdown in this repository, so it is trusted. */
  protected readonly html = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.doc().html));

  protected readonly editUrl = computed(
    () =>
      `${REPO}/edit/main/apps/docs/src/content/${this.doc().page.section.slug}/${this.doc().page.slug}.md`,
  );

  constructor() {
    const meta = inject(Meta);
    effect(() => meta.updateTag({ name: 'description', content: this.doc().page.description }));

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
    if (!anchor || anchor.target !== '') {
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

async function drawDiagrams(nodes: NodeListOf<HTMLElement>): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    fontFamily: 'Geist, sans-serif',
  });
  await mermaid.run({ nodes });
}
