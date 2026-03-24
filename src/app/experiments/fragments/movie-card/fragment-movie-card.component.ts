import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FRAGMENT_MOVIE_CARD_DATA } from './fragment-movie-card.data';

@Component({
  standalone: true,
  selector: 'exp-fragment-movie-card',
  template: `
    <article data-fragment="movie-card" [attr.data-movie-id]="movie.id">
      <header>
        <p>Server-rendered fragment experiment</p>
        <h2>{{ movie.title }}</h2>
      </header>

      <p>{{ movie.summary }}</p>

      <dl>
        <div>
          <dt>Year</dt>
          <dd>{{ movie.year }}</dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>{{ movie.rating }}</dd>
        </div>
        <div>
          <dt>Genres</dt>
          <dd>{{ movie.genres.join(', ') }}</dd>
        </div>
      </dl>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FragmentMovieCardComponent {
  protected readonly movie = inject(FRAGMENT_MOVIE_CARD_DATA);
}
