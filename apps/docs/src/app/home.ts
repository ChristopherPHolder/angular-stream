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

    <!-- The one choice every reader makes: where the app runs. -->
    @for (section of runtimes; track section.id) {
      <section class="home-section" [attr.aria-labelledby]="'home-' + section.id">
        <h2 class="text-section-title" [id]="'home-' + section.id">Pick your runtime</h2>
        <p class="lede">{{ section.description }}</p>
        @for (group of section.groups; track $index) {
          <h3 class="home-group text-subtitle">{{ group.title }}</h3>
          <ul class="tiles">
            @for (page of group.pages; track page.slug) {
              <li>
                <a class="tile" [routerLink]="['/docs', page.dir, page.slug]">
                  {{ page.title }}
                  <span>{{
                    page.runtime?.adapter ? page.runtime?.adapter + ' adapter' : 'core only'
                  }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </section>
    }

    <div class="cards">
      @for (section of sections; track section.id) {
        <section class="pb-card" [attr.aria-labelledby]="'home-' + section.id">
          <h2 class="pb-card-title" [id]="'home-' + section.id">{{ section.title }}</h2>
          <p class="pb-card-body">{{ section.description }}</p>
          <ul>
            @for (group of section.groups; track $index) {
              @for (page of group.pages; track page.dir + '/' + page.slug) {
                <li>
                  <a [routerLink]="['/docs', page.dir, page.slug]">{{ page.title }}</a>
                </li>
              }
            }
          </ul>
        </section>
      }
    </div>
  `,
  host: { class: 'home' },
  imports: [NgOptimizedImage, RouterLink],
})
export class Home {
  protected readonly symbol = symbol;
  protected readonly demo = DEMO;

  /** The sections whose pages are alternatives: shown as a choice, group by group. */
  protected readonly runtimes = DOCS.filter((section) => section.alternatives);

  /** The sections read in order, as a card each. The press kit is in the footer. */
  protected readonly sections = DOCS.filter(
    (section) => !section.alternatives && section.id !== 'about',
  );
}
