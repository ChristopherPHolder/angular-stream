import { NgOptimizedImage, PlatformLocation } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EventLog } from './event-log';

@Component({
  selector: 'app-root',
  template: `
    <header class="top">
      <div class="top-inner">
        <a class="brand text-card-title" href="/">
          <img ngSrc="pushbased-logo.svg" alt="PushBased" width="86" height="32" priority />
          angular-stream <span>demo</span>
        </a>
        <!-- Plain links: every page load should be a fresh streamed response. -->
        <nav class="text-link-mono" aria-label="Pages">
          <a href="/">Overview</a>
          <a href="/example">Example</a>
          <a href="/walkthrough">Walkthrough</a>
          <a href="/inspect">Response inspector</a>
        </nav>
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
  `,
  imports: [NgOptimizedImage, RouterOutlet, EventLog],
})
export class App {
  /**
   * Every page load is a full navigation, so the path at bootstrap is the page
   * for good. Read from the location rather than the router, which has not
   * navigated yet when this component is created; server and browser must
   * agree here, or hydration fails. Only the walkthrough and the inspector
   * have the log; the other pages explain themselves.
   */
  protected readonly showLog = /^\/(walkthrough|inspect)\b/.test(inject(PlatformLocation).pathname);
}
