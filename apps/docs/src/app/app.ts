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
import {
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
// `?no-inline`: Vite would inline an asset this small as a data: URI, which NgOptimizedImage rejects.
import logo from '@angular-ssr-stream/press-kit/symbol/angular-ssr-stream-symbol.svg?no-inline';
import pushBased from '@angular-ssr-stream/design-system/pushbased-logo.svg?no-inline';
import { ALL_PAGES, DOCS, type DocSection } from './docs/nav';
import { DEMO, MOVIES, REPO } from './links';
import { trackPageHead } from './page-head';
import { DocsSearch } from './search/search';

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
          angular-ssr-stream
        </a>
        <docs-search />
        <nav class="top-nav text-link-mono" aria-label="Site">
          <a class="top-link" routerLink="/docs/getting-started/introduction">Docs</a>
          <a class="top-link" [href]="demo">Demo</a>
          <a class="icon-btn" [href]="repo" aria-label="angular-ssr-stream on GitHub">
            <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
              />
            </svg>
          </a>
        </nav>
        <!--
          On a phone or a tablet, the sidebar is a menu this opens over the page.
          Its name stays "Menu": aria-expanded says whether it is open, and the
          three lines turn into a cross.
        -->
        <button
          type="button"
          class="menu-toggle icon-btn"
          aria-controls="docs-contents"
          [attr.aria-expanded]="menuOpen()"
          (click)="menuOpen() ? closeMenu() : openMenu()"
          #menuButton
        >
          <svg class="menu-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M3 5h14" />
            <path d="M3 10h14" />
            <path d="M3 15h14" />
          </svg>
          <span class="visually-hidden">Menu</span>
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
        <!-- The header's links: the menu button takes their place, and on the
             narrowest phones the repository's too. -->
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
        <div class="bottom-about">
          <a class="brand text-card-title" routerLink="/">
            <img [ngSrc]="logo" alt="" width="32" height="32" />
            angular-ssr-stream
          </a>
          <p>
            Streamed server-side rendering for Angular: the page goes out at once, and its slow
            parts follow in the same response.
          </p>
        </div>
        <nav class="bottom-nav" aria-label="Footer">
          <div class="bottom-docs">
            <p class="bottom-title text-subtitle" id="footer-docs">Docs</p>
            <ul aria-labelledby="footer-docs">
              @for (section of footerSections; track section.title) {
                <li>
                  <a [routerLink]="section.link" [fragment]="section.fragment">{{
                    section.title
                  }}</a>
                </li>
              }
            </ul>
          </div>
          <div class="bottom-live">
            <p class="bottom-title text-subtitle" id="footer-live">See it run</p>
            <ul aria-labelledby="footer-live">
              <li><a [href]="demo">The live demo</a></li>
              <li><a [href]="movies">Angular Movies</a></li>
            </ul>
          </div>
          <div class="bottom-project">
            <p class="bottom-title text-subtitle" id="footer-project">Project</p>
            <ul aria-labelledby="footer-project">
              <li><a [href]="repo">Source on GitHub</a></li>
              <li><a [href]="issues">Report an issue</a></li>
              <li><a routerLink="/docs/reference/faq">FAQ</a></li>
              <li><a routerLink="/docs/reference/releases">Releases and upgrading</a></li>
              <li><a routerLink="/docs/reference/press-kit">Press kit</a></li>
              <!-- The contents for a language model; the build writes it (scripts/prerender.ts). -->
              <li><a href="llms.txt">llms.txt</a></li>
            </ul>
          </div>
        </nav>
        <p class="bottom-by">
          <a href="https://push-based.io/">
            Built by
            <img [ngSrc]="pushBased" alt="PushBased" width="86" height="32" />
          </a>
        </p>
      </div>
    </footer>
  `,
  host: { '(document:keydown.escape)': 'escaped()' },
  imports: [DocsSearch, NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
})
export class App {
  protected readonly logo = logo;
  protected readonly pushBased = pushBased;
  protected readonly docs = DOCS;
  protected readonly demo = DEMO;
  protected readonly movies = MOVIES;
  protected readonly repo = REPO;
  protected readonly issues = REPO + '/issues';

  /**
   * The footer's way into each section: its first page, or, where the pages
   * are alternatives, the choice between them on the home page. The press kit
   * is listed with the project.
   */
  protected readonly footerSections = DOCS.filter((section) => section.id !== 'about').map(
    (section) => {
      const first = section.groups[0].pages[0];
      return section.alternatives
        ? { title: section.title, link: ['/'], fragment: 'home-' + section.id }
        : { title: section.title, link: ['/docs', first.dir, first.slug], fragment: undefined };
    },
  );

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
    // Whether the menu was open when the latest navigation started.
    let fromMenu = false;
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          fromMenu = this.menuOpen();
          return;
        }
        // Only a navigation that started from the open menu closes it. The first
        // one starts before anyone can tap, and may end after the menu was
        // opened while the page was still loading: that menu stays open.
        if (fromMenu && this.menuOpen()) {
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

  /**
   * Escape closes the menu. A method, not `menuOpen() && closeMenu()` in the
   * host binding: that expression is `false` while the menu is closed, and
   * Angular cancels an event whose listener returns `false`, which kept Escape
   * from everything else on the page, such as closing the search dialog.
   */
  protected escaped(): void {
    if (this.menuOpen()) {
      this.closeMenu();
    }
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
