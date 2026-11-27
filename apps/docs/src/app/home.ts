import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
// `?no-inline`: Vite would inline an asset this small as a data: URI, which NgOptimizedImage rejects.
import symbol from '@angular-stream/press-kit/symbol/angular-stream-symbol.svg?no-inline';
import { DOCS } from './docs/nav';
import { DEMO } from './links';

@Component({
  selector: 'docs-home',
  template: `
    <img class="home-mark" [ngSrc]="symbol" alt="" width="96" height="96" priority />
    <p class="text-subtitle eyebrow">Angular · SSR · Streaming</p>
    <h1 class="text-hero-title">Streamed hydration for Angular</h1>
    <p class="text-lead lede">
      One response, sent in pieces. The browser hydrates the page while the rest is still on its
      way, and nothing is fetched twice.
    </p>
    <p class="actions">
      <a class="pb-btn pb-btn-primary" routerLink="/docs/getting-started/introduction"
        >Read the docs</a
      >
      <a class="pb-btn pb-btn-ghost" [href]="demo">See it in the demo</a>
    </p>
    <div class="cards">
      @for (section of docs; track section.slug) {
        <section class="pb-card" [attr.aria-labelledby]="'home-' + section.slug">
          <div class="pb-card-body">
            <h2 class="pb-card-title" [id]="'home-' + section.slug">{{ section.title }}</h2>
            <ul>
              @for (page of section.pages; track page.slug) {
                <li>
                  <a [routerLink]="['/docs', section.slug, page.slug]">{{ page.title }}</a>
                  <span>{{ page.description }}</span>
                </li>
              }
            </ul>
          </div>
        </section>
      }
    </div>
  `,
  host: { class: 'home' },
  imports: [NgOptimizedImage, RouterLink],
})
export class Home {
  protected readonly symbol = symbol;
  protected readonly docs = DOCS;
  protected readonly demo = DEMO;
}
