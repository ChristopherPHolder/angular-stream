import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'docs-not-found',
  template: `
    <p class="text-subtitle eyebrow">404</p>
    <h1 class="text-section-title">This page does not exist</h1>
    <p>
      It may have moved. Start from the
      <a routerLink="/docs/getting-started/introduction">introduction</a>, or pick a page from the
      contents.
    </p>
  `,
  imports: [RouterLink],
})
export class NotFound {}
