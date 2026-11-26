import { selectSlice } from '@rx-angular/state/selections';
import { Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MovieListPageAdapter, MovieListPageModel } from './movie-list-page.adapter';
import { MovieListComponent } from '../../ui/pattern/movie-list/movie-list.component';

type Heading = { main: string; sub: string };

@Component({
  imports: [MovieListComponent],
  selector: 'ct-movies-list',
  templateUrl: './movie-list-page.component.html',
  styleUrls: ['./movie-list-page.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
})
export default class MovieListPageComponent {
  private readonly adapter = inject(MovieListPageAdapter);

  readonly movies$ = this.adapter.movies$;
  readonly loading$ = this.adapter.select('loading');
  private readonly route = toSignal(this.adapter.select(selectSlice(['identifier', 'type'])));
  private readonly genres = toSignal(this.adapter.select('genres'));
  /**
   * Categories and searches take their heading from the URL, so it is in the
   * shell. A genre needs its name from TMDB, so its heading streams in with
   * the genre list.
   */
  readonly headings = computed(() => toHeading(this.route(), this.genres()));
  readonly loading = toSignal(this.loading$, { initialValue: false });

  /**
   * True once the first page has an answer, even an empty one. This is the
   * list's hydrate trigger: on a streamed render the client's copy of that
   * answer arrives together with the markup the server rendered from it, so
   * the block hydrates the moment the two agree.
   */
  readonly listReady = toSignal(this.movies$.pipe(map((movies) => movies !== undefined)), {
    initialValue: false,
  });

  paginate() {
    this.adapter.paginate();
  }
}

function toHeading(
  route: Pick<MovieListPageModel, 'type' | 'identifier'> | undefined,
  genres: MovieListPageModel['genres'] | undefined,
): Heading {
  if (!route) {
    return { main: '', sub: '' };
  }
  const { identifier, type } = route;
  // a genre identifier is an id, mapped to its name once the genres are there
  const main = type === 'genre' ? (genres?.[identifier]?.name ?? '') : identifier;

  return { main: main.replace(/[-_]/, ' '), sub: type };
}
