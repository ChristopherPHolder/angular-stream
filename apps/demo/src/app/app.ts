import { PlatformLocation } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EventLog } from './event-log';

@Component({
  selector: 'app-root',
  template: `
    <header class="top">
      <a class="brand" href="/">angular-stream <span>demo</span></a>
      <!-- Plain links: every page load should be a fresh streamed response. -->
      <nav aria-label="Pages">
        <a href="/simple">Simple</a>
        <a href="/">Walkthrough</a>
        <a href="/inspect">Response inspector</a>
      </nav>
    </header>
    <div class="layout" [class.layout--single]="!showLog">
      <main>
        <router-outlet />
      </main>
      @if (showLog) {
        <aside class="log">
          <demo-event-log />
        </aside>
      }
    </div>
  `,
  imports: [RouterOutlet, EventLog],
})
export class App {
  /**
   * Every page load is a full navigation, so the path at bootstrap is the page
   * for good. Read from the location rather than the router, which has not
   * navigated yet when this component is created; server and browser must
   * agree here, or hydration fails. The simple page leaves the log out to
   * keep to its three steps.
   */
  protected readonly showLog = !inject(PlatformLocation).pathname.startsWith('/simple');
}
