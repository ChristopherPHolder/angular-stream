import { Location, NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
// `?no-inline`: Vite would inline an asset this small as a data: URI, which NgOptimizedImage rejects.
import logo from '@angular-stream/design-system/pushbased-logo.svg?no-inline';
import { DOCS } from './docs/nav';
import { DEMO, MOVIES, REPO } from './links';

@Component({
  selector: 'app-root',
  template: `
    <!-- Qualified with the current path: a bare #content resolves against the base href. -->
    <a class="skip-link" [href]="skipLink()" (click)="main.focus()">Skip to content</a>
    <header class="top">
      <div class="top-inner">
        <a class="brand text-card-title" routerLink="/">
          <img [ngSrc]="logo" alt="PushBased" width="86" height="32" priority />
          angular-stream <span>docs</span>
        </a>
        <nav class="top-nav text-link-mono" aria-label="Site">
          <a routerLink="/docs/getting-started/introduction">Docs</a>
          <a [href]="demo">Demo</a>
          <a [href]="repo">GitHub</a>
        </nav>
      </div>
    </header>
    <div class="shell">
      <nav class="sidebar" aria-label="Documentation">
        <button
          type="button"
          class="sidebar-toggle pb-btn pb-btn-ghost"
          aria-controls="docs-contents"
          [attr.aria-expanded]="menuOpen()"
          (click)="menuOpen.set(!menuOpen())"
        >
          Contents
        </button>
        <div id="docs-contents" class="sidebar-list" [class.sidebar-list--open]="menuOpen()">
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
        </div>
      </nav>
      <main id="content" tabindex="-1" #main>
        <router-outlet />
      </main>
    </div>
    <footer class="bottom">
      <div class="bottom-inner">
        <p>Streamed server-side rendering for Angular.</p>
        <nav aria-label="Elsewhere">
          <a [href]="demo">The demo</a>
          <a [href]="movies">Angular Movies, a real app</a>
          <a [href]="repo">Source on GitHub</a>
          <a href="https://push-based.io/">PushBased</a>
        </nav>
      </div>
    </footer>
  `,
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
})
export class App {
  protected readonly logo = logo;
  protected readonly docs = DOCS;
  protected readonly demo = DEMO;
  protected readonly movies = MOVIES;
  protected readonly repo = REPO;

  /** The contents on a phone, where they collapse behind a button. */
  protected readonly menuOpen = signal(false);

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
        this.menuOpen.set(false);
        // The path in the address bar, which an unknown page keeps.
        this.skipLink.set(location.path().replace(/^\//, '') + '#content');
      });
  }
}
