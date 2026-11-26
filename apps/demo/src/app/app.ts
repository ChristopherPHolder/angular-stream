import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EventLog } from './event-log';

@Component({
  selector: 'app-root',
  template: `
    <header class="top">
      <a class="brand" href="/">angular-stream <span>demo</span></a>
      <!-- Plain links: every page load should be a fresh streamed response. -->
      <nav aria-label="Pages">
        <a href="/">Walkthrough</a>
        <a href="/inspect">Response inspector</a>
      </nav>
    </header>
    <div class="layout">
      <main>
        <router-outlet />
      </main>
      <aside class="log">
        <demo-event-log />
      </aside>
    </div>
  `,
  imports: [RouterOutlet, EventLog],
})
export class App {}
