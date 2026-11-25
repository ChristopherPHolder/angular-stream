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
import { StreamBoundaryDirective } from '../../streaming/stream-boundary.directive';

type Heading = { main: string; sub: string };

@Component({
  imports: [MovieListComponent, StreamBoundaryDirective],
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
   * Readiness for the SSR stream boundary: true once the first page of movies
   * has actually rendered. Until then the server holds the boundary back and
   * the shell goes out without it.
   */
  readonly listReady = toSignal(
    this.movies$.pipe(map((movies) => (movies?.length ?? 0) > 0)),
    { initialValue: false },
  );

  constructor() {
    this.adapter.set({ loading: true });
  }

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
