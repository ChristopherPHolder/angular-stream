import { Component } from '@angular/core';

/** What an address with no page gets. The Worker answers it with 404 (`worker.ts`). */
@Component({
  selector: 'demo-not-found',
  template: `
    <header class="intro">
      <p class="text-subtitle eyebrow">404</p>
      <h1 class="text-hero-title">This page does not exist</h1>
      <p class="text-lead">
        The demo has four pages. Start from the <a href="/">overview</a>, or go straight to the
        <a href="/example">live example</a>.
      </p>
    </header>
  `,
})
export class NotFound {}
