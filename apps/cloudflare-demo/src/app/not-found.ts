import { Component } from '@angular/core';

/** What an address with no page gets. The Worker answers it with 404 (`worker.ts`). */
@Component({
  selector: 'demo-not-found',
  template: `
    <header class="intro">
      <p class="text-subtitle eyebrow">404</p>
      <h1 class="text-hero-title">This page does not exist</h1>
      <p class="text-lead">
        The demo has three pages. Start from the <a href="/">live example</a>, or go on to the
        <a href="/walkthrough">walkthrough</a> or the <a href="/inspect">response inspector</a>.
      </p>
    </header>
  `,
})
export class NotFound {}
