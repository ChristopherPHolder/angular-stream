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
import { DOCS } from './docs/nav';
import { DEMO, MOVIES, REPO } from './links';

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
        @for (section of docs; track section.slug) {
          <p class="sidebar-section text-subtitle" [id]="'nav-' + section.slug">
            {{ section.title }}
          </p>
          <ul [attr.aria-labelledby]="'nav-' + section.slug">
            @for (page of section.pages; track page.slug) {
              <li>
                <a
                  [routerLink]="['/docs', section.slug, page.slug]"
                  routerLinkActive="active"
                  ariaCurrentWhenActive="page"
                  >{{ page.title }}</a
                >
              </li>
            }
          </ul>
        }
        <!-- The header's links, which have no room next to the menu button. -->
        <p class="sidebar-section sidebar-elsewhere text-subtitle" id="nav-elsewhere">Elsewhere</p>
        <ul class="sidebar-elsewhere" aria-labelledby="nav-elsewhere">
          <li><a [href]="demo">Demo</a></li>
          <li><a [href]="repo">GitHub</a></li>
        </ul>
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

  constructor() {
    const location = inject(Location);
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
        const link = links.querySelector<HTMLElement>('a.active') ?? links.querySelector('a');
        link?.focus();
        link?.scrollIntoView({ block: 'center' });
      },
      { injector: this.injector },
    );
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

/** Up to this width the sidebar is a menu; `styles.css` uses the same number. */
const MENU_BREAKPOINT = 900;

/** Space between the sticky header and a heading scrolled to, in pixels (`--space-6`). */
const HEADING_GAP = 24;
