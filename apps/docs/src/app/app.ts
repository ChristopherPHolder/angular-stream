import { DOCUMENT, Location, NgOptimizedImage, ViewportScroller } from '@angular/common';
import {
  Component,
  type ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
// `?no-inline`: Vite would inline an asset this small as a data: URI, which NgOptimizedImage rejects.
import logo from '@angular-stream/press-kit/symbol/angular-stream-symbol.svg?no-inline';
import { ALL_PAGES, DOCS, type DocSection } from './docs/nav';
import { DEMO, MOVIES, REPO } from './links';
import { trackPageHead } from './page-head';

@Component({
  selector: 'app-root',
  template: `
    <!-- Qualified with the current path: a bare #content resolves against the base href. -->
    <a class="skip-link" [href]="skipLink()" (click)="main.focus()">Skip to content</a>
    <header class="top" #top>
      <div class="top-inner">
        <a class="brand text-card-title" routerLink="/">
          <!-- Decorative: the name is the text next to it. -->
          <img [ngSrc]="logo" alt="" width="32" height="32" priority />
          angular-stream <span>docs</span>
        </a>
        <nav class="top-nav text-link-mono" aria-label="Site">
          <a routerLink="/docs/getting-started/introduction">Docs</a>
          <a [href]="demo">Demo</a>
          <a [href]="repo">GitHub</a>
        </nav>
        <!-- On a phone or a tablet, the sidebar is a menu this opens over the page. -->
        <button
          type="button"
          class="menu-toggle pb-btn pb-btn-ghost"
          aria-controls="docs-contents"
          [attr.aria-expanded]="menuOpen()"
          (click)="menuOpen() ? closeMenu() : openMenu()"
          #menuButton
        >
          {{ menuOpen() ? 'Close' : 'Menu' }}
        </button>
      </div>
    </header>
    <div class="shell">
      @if (menuOpen()) {
        <div class="backdrop" (click)="closeMenu()"></div>
      }
      <nav
        id="docs-contents"
        class="sidebar"
        aria-label="Documentation"
        [class.sidebar--open]="menuOpen()"
        #sidebar
      >
        <!-- A section folds: the one the reader is in is open, the long ones start closed. -->
        @for (section of docs; track section.id) {
          <details
            class="sidebar-section"
            [open]="isOpen(section)"
            (toggle)="toggled(section, $event)"
          >
            <summary class="sidebar-title text-subtitle">{{ section.title }}</summary>
            @for (group of section.groups; track $index) {
              @if (group.title) {
                <p class="sidebar-group">{{ group.title }}</p>
              }
              <ul [attr.aria-label]="group.title ?? section.title">
                @for (page of group.pages; track page.dir + '/' + page.slug) {
                  <li>
                    <a
                      [routerLink]="['/docs', page.dir, page.slug]"
                      routerLinkActive="active"
                      ariaCurrentWhenActive="page"
                      >{{ page.title }}</a
                    >
                  </li>
                }
              </ul>
            }
          </details>
        }
        <!-- The header's links, which have no room next to the menu button. -->
        <div class="sidebar-section sidebar-elsewhere">
          <p class="sidebar-title text-subtitle" id="nav-elsewhere">Elsewhere</p>
          <ul aria-labelledby="nav-elsewhere">
            <li><a [href]="demo">Demo</a></li>
            <li><a [href]="repo">GitHub</a></li>
          </ul>
        </div>
      </nav>
      <!-- Inert under the open menu, so Tab stays in the menu and the header. -->
      <main id="content" tabindex="-1" [attr.inert]="menuOpen() ? '' : null" #main>
        <router-outlet />
      </main>
    </div>
    <footer class="bottom" [attr.inert]="menuOpen() ? '' : null">
      <div class="bottom-inner">
        <p>Streamed server-side rendering for Angular.</p>
        <nav aria-label="Elsewhere">
          <a [href]="demo">The demo</a>
          <a [href]="movies">Angular Movies, a real app</a>
          <a [href]="repo">Source on GitHub</a>
          <a routerLink="/docs/reference/press-kit">Press kit</a>
          <a href="https://push-based.io/">PushBased</a>
        </nav>
      </div>
    </footer>
  `,
  host: { '(document:keydown.escape)': 'menuOpen() && closeMenu()' },
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
})
export class App {
  protected readonly logo = logo;
  protected readonly docs = DOCS;
  protected readonly demo = DEMO;
  protected readonly movies = MOVIES;
  protected readonly repo = REPO;

  /** The sidebar as a menu over the page, below `MENU_BREAKPOINT`. */
  protected readonly menuOpen = signal(false);

  private readonly injector = inject(Injector);
  private readonly top = viewChild.required<ElementRef<HTMLElement>>('top');
  private readonly menuButton = viewChild.required<ElementRef<HTMLElement>>('menuButton');
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  /** `<current path>#content`, relative to the base href like every other link. */
  protected readonly skipLink = signal('#content');

  /**
   * The section of the page being read. Read from the address on creation, not
   * only once the router has navigated, so the prerendered sidebar isn't folded
   * and unfolded again while the page hydrates.
   */
  private readonly currentSection = signal<DocSection | undefined>(undefined);

  /** Sections the reader opened or closed by hand, until the next page. */
  private readonly toggledSections = signal<Record<string, boolean>>({});

  constructor() {
    trackPageHead();

    const location = inject(Location);
    this.currentSection.set(sectionOf(location.path()));
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (this.menuOpen()) {
          // The link that was followed is in the menu, which is closing.
          this.menuOpen.set(false);
          this.focusNext(this.main);
        }
        // The path in the address bar, which an unknown page keeps.
        this.skipLink.set(location.path().replace(/^\//, '') + '#content');
        this.currentSection.set(sectionOf(location.path()));
        this.toggledSections.set({});
        afterNextRender(() => this.showCurrentLink(), { injector: this.injector });
      });

    // A heading the router scrolls to lands below the sticky header, not under it.
    inject(ViewportScroller).setOffset(() => [
      0,
      this.top().nativeElement.offsetHeight + HEADING_GAP,
    ]);

    // The page behind the open menu does not scroll.
    const root = inject(DOCUMENT).documentElement;
    effect(() => root.classList.toggle('menu-open', this.menuOpen()));

    // Wide enough for the sidebar again: nothing is left to close the menu with.
    afterNextRender(() => {
      const wide = window.matchMedia(`(min-width: ${MENU_BREAKPOINT + 1}px)`);
      wide.addEventListener('change', () => {
        if (wide.matches) {
          this.menuOpen.set(false);
        }
      });
    });
  }

  protected openMenu(): void {
    this.menuOpen.set(true);
    afterNextRender(
      () => {
        const links = this.sidebar().nativeElement;
        // The current page; on a page that isn't listed, the first section's heading.
        const link = links.querySelector<HTMLElement>('a.active') ?? links.querySelector('summary');
        link?.focus();
        link?.scrollIntoView({ block: 'center' });
      },
      { injector: this.injector },
    );
  }

  /**
   * The sidebar scrolls by itself when it is taller than the window: brings
   * the current page's link into its view. Not `scrollIntoView()`, which would
   * scroll the page as well.
   */
  private showCurrentLink(): void {
    const sidebar = this.sidebar().nativeElement;
    const link = sidebar.querySelector<HTMLElement>('a.active');
    if (!link) {
      return;
    }
    const top = link.getBoundingClientRect().top - sidebar.getBoundingClientRect().top;
    if (top < 0 || top + link.offsetHeight > sidebar.clientHeight) {
      sidebar.scrollTop += top - sidebar.clientHeight / 2;
    }
  }

  protected isOpen(section: DocSection): boolean {
    return (
      this.toggledSections()[section.id] ??
      (!section.collapsed || section === this.currentSection())
    );
  }

  protected toggled(section: DocSection, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    this.toggledSections.update((sections) => ({ ...sections, [section.id]: open }));
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
    this.focusNext(this.menuButton);
  }

  /** Focuses an element once the menu's `inert` and visibility have been rendered. */
  private focusNext(element: () => ElementRef<HTMLElement>): void {
    afterNextRender(() => element().nativeElement.focus(), { injector: this.injector });
  }
}

/** The section of the page at a path such as `/docs/guides/debugging#quick-checks`. */
function sectionOf(path: string): DocSection | undefined {
  const page = path.replace(/^\//, '').split(/[?#]/)[0];
  return ALL_PAGES.find((other) => other.path === page)?.section;
}

/** Up to this width the sidebar is a menu; `styles.css` uses the same number. */
const MENU_BREAKPOINT = 900;

/** Space between the sticky header and a heading scrolled to, in pixels (`--space-6`). */
const HEADING_GAP = 24;
