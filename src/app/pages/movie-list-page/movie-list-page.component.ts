import { selectSlice } from '@rx-angular/state/selections';
import {
  Component,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, Observable } from 'rxjs';
import {
  MovieListPageAdapter,
  MovieListPageModel,
} from './movie-list-page.adapter';
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
  readonly headings$: Observable<Heading> = this.adapter.select(
    selectSlice(['identifier', 'type', 'genres']),
    map(toHeading)
  );
  readonly headings = toSignal(this.headings$, { initialValue: { main: '', sub: '' } });
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
  routerParams: Pick<MovieListPageModel, 'type' | 'identifier' | 'genres'>
): Heading {
  const { identifier, type, genres } = routerParams;
  // default
  let main: string = identifier;
  const sub: string = type;

  // genre identifier needs to get mapped to a real title
  if (type === 'genre') {
    main = genres[parseInt(identifier)].name;
  }

  main = main.replace(/[-_]/, ' ');

  return { main, sub };
}
