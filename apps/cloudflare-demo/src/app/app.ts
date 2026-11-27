import { NgOptimizedImage, PlatformLocation } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
// `?no-inline`: Vite would inline an asset this small as a data: URI, which NgOptimizedImage rejects.
import logo from '@angular-stream/design-system/pushbased-logo.svg?no-inline';
import { EventLog } from './event-log';

const REPO = 'https://github.com/push-based/angular-stream';
const DOCS = 'https://push-based.github.io/angular-stream/';

/** The pages, in the order to read them: from the idea to the detail. */
const PAGES = [
  { path: '/', label: 'Overview' },
  { path: '/example', label: 'Example' },
  { path: '/walkthrough', label: 'Walkthrough' },
  { path: '/inspect', label: 'Inspector' },
];

/** The menu entry for a path. `/simple` is the example's old address. */
function currentPage(path: string): string | null {
  if (path.startsWith('/simple')) {
    return '/example';
  }
  const page = PAGES.find((page) =>
    page.path === '/' ? path === '/' : path.startsWith(page.path),
  );
  return page?.path ?? null;
}

@Component({
  selector: 'app-root',
  template: `
    <header class="top">
      <div class="top-inner">
        <a class="brand text-card-title" href="/">
          <img [ngSrc]="logo" alt="PushBased" width="86" height="32" priority />
          angular-stream <span>demo</span>
        </a>
        <!-- Plain links: every page load should be a fresh streamed response. -->
        <nav class="top-nav text-link-mono" aria-label="Pages">
          @for (page of pages; track page.path) {
            <a [href]="page.path" [attr.aria-current]="page.path === current ? 'page' : null">{{
              page.label
            }}</a>
          }
        </nav>
        <a class="top-repo" [href]="repo" aria-label="angular-stream on GitHub">
          <svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
            />
          </svg>
        </a>
      </div>
    </header>
    <div class="layout" [class.layout--single]="!showLog">
      <main>
        <router-outlet />
      </main>
      @if (showLog) {
        <!-- Focusable: the log scrolls once it is taller than the window. -->
        <aside class="log" tabindex="0" aria-label="Event log">
          <demo-event-log />
        </aside>
      }
    </div>
    <footer class="bottom">
      <div class="bottom-inner">
        <p>Streamed server-side rendering for Angular, on Cloudflare Workers.</p>
        <nav aria-label="Elsewhere">
          <a href="https://angular-stream.chris-holder.workers.dev/">Angular Movies, a real app</a>
          <a [href]="repo">Source on GitHub</a>
          <a [href]="docs">The docs</a>
          <a href="https://push-based.io/">PushBased</a>
        </nav>
      </div>
    </footer>
  `,
  imports: [NgOptimizedImage, RouterOutlet, EventLog],
})
export class App {
  protected readonly repo = REPO;
  protected readonly docs = DOCS;
  protected readonly logo = logo;
  protected readonly pages = PAGES;

  /**
   * Every page load is a full navigation, so the path at bootstrap is the page
   * for good. Read from the location rather than the router, which has not
   * navigated yet when this component is created; server and browser must
   * agree here, or hydration fails.
   */
  private readonly path = inject(PlatformLocation).pathname;

  /** The page to mark in the menu. */
  protected readonly current = currentPage(this.path);

  /** Only the walkthrough and the inspector have the log; the other pages explain themselves. */
  protected readonly showLog = /^\/(walkthrough|inspect)\b/.test(this.path);
}
