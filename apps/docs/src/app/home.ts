import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
// `?no-inline`: Vite would inline an asset this small as a data: URI, which NgOptimizedImage rejects.
import symbol from '@angular-ssr-stream/press-kit/symbol/angular-ssr-stream-symbol.svg?no-inline';
import { DOCS } from './docs/nav';
import { HomeRace } from './home-race';
import { DEMO } from './links';

/**
 * The home page. The first screen is the hook: the problem in a headline, the
 * two ways on (try it, or watch the demo) and the difference, moving. The
 * explanation follows, and ends on the same two ways on. Where the app runs is
 * asked after that, not before.
 */
@Component({
  selector: 'docs-home',
  template: `
    <header class="home-hero">
      <div class="home-pitch">
        <img class="home-mark" [ngSrc]="symbol" alt="" width="64" height="64" priority />
        <p class="text-subtitle eyebrow">Streaming SSR for Angular</p>
        <h1 class="text-hero-title">Don't make the whole page wait for its slowest part</h1>
        <p class="text-lead lede">
          angular-ssr-stream sends a server-rendered Angular page straight away and streams the slow
          parts into it as they finish, in the same response. Angular hydrates each part as it
          lands.
        </p>
        <p class="home-actions">
          <a class="pb-btn pb-btn-lg pb-btn-primary" routerLink="/docs/getting-started/installation"
            >Get started</a
          >
          <a class="pb-btn pb-btn-lg pb-btn-ghost" [href]="demo">Open the live demo</a>
        </p>
      </div>
      <docs-home-race />
    </header>

    <section class="home-section" aria-labelledby="home-problem">
      <h2 class="text-section-title" id="home-problem">A page is as slow as its slowest request</h2>
      <p class="home-text">
        Angular renders a page on the server and sends it whole. Take the product page above: the
        product renders at once, its reviews take one second and its recommendations three. Sent
        whole, that is a blank page for three seconds. Streamed, the reader has the product straight
        away and the reviews after one.
      </p>
      <p class="home-text">
        Both pages are complete at the same moment: streaming does not make a slow request faster.
        It stops the rest of the page, and the browser's work on styles, fonts and scripts, from
        waiting for it.
      </p>
    </section>

    <section class="home-section" aria-labelledby="home-how">
      <h2 class="text-section-title" id="home-how">What angular-ssr-stream does</h2>
      <p class="home-text">
        The server keeps the response open and adds to it. There is no second request and no
        fetching from the browser.
      </p>
      <ol class="steps">
        <li>
          <h3 class="text-card-title">The shell goes out at once</h3>
          <p>
            The server sends everything that does not wait for data, with a placeholder for each
            part that does. The browser loads Angular and hydrates the shell while the response is
            still open.
          </p>
        </li>
        <li>
          <h3 class="text-card-title">Each slow part follows</h3>
          <p>
            When a request finishes, the server renders the part that waited for it and adds it to
            the response. A small inline script puts it in place, whether or not Angular is running
            yet.
          </p>
        </li>
        <li>
          <h3 class="text-card-title">Angular hydrates it</h3>
          <p>
            The part hydrates against the streamed markup when its trigger fires. Its data came with
            it, so nothing is fetched twice.
          </p>
        </li>
      </ol>
      <p class="home-text">
        In your app, a slow part is a <code>&#64;defer</code> block with a
        <code>hydrate</code> trigger. The rest is a few providers in the app config and a server
        entry for where the app runs.
      </p>
    </section>

    <!-- The same two ways on as the hero's, for the reader who read this far. -->
    <div class="paths">
      <section class="path path--primary" aria-labelledby="home-try">
        <h2 class="text-title" id="home-try">Try it in your app</h2>
        <p>
          Install the core, add its providers and write the server entry. Each of the
          {{ runtimeCount }} runtimes has a setup page of its own, from the app config to running
          it.
        </p>
        <a class="pb-btn pb-btn-lg pb-btn-primary" routerLink="/docs/getting-started/installation"
          >Get started</a
        >
      </section>
      <section class="path" aria-labelledby="home-demo">
        <h2 class="text-title" id="home-demo">Watch it happen</h2>
        <p>
          The live demo sends one page three ways on the same clock, steps through a response piece
          by piece, and streams a real widget next to the code for it.
        </p>
        <a class="pb-btn pb-btn-lg pb-btn-ghost" [href]="demo">Open the live demo</a>
      </section>
    </div>

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
  imports: [HomeRace, NgOptimizedImage, RouterLink],
})
export class Home {
  protected readonly symbol = symbol;
  protected readonly demo = DEMO;

  /** The sections whose pages are alternatives: shown as a choice, group by group. */
  protected readonly runtimes = DOCS.filter((section) => section.alternatives);

  /** How many setup pages there are to choose from. */
  protected readonly runtimeCount = this.runtimes.reduce(
    (count, section) =>
      count + section.groups.reduce((pages, group) => pages + group.pages.length, 0),
    0,
  );

  /** The sections read in order, as a card each. The press kit is in the footer. */
  protected readonly sections = DOCS.filter(
    (section) => !section.alternatives && section.id !== 'about',
  );
}
