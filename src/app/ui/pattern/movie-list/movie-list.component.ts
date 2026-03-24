import { NgOptimizedImage } from '@angular/common';
import { RxState } from '@rx-angular/state';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, Observable } from 'rxjs';
import { rxActions } from '@rx-angular/state/actions';
import { coerceObservable } from '../../../shared/cdk/coerceObservable';
import { RxInputType } from '../../../shared/cdk/input-type.typing';
import { RouterLink } from '@angular/router';
import { StarRatingComponent } from '../star-rating/star-rating.component';
import { ElementVisibilityDirective } from '../../../shared/cdk/element-visibility/element-visibility.directive';
import { FastSvgComponent } from '@push-based/ngx-fast-svg';
import { GridListComponent } from '../../component/grid-list/grid-list.component';
import { Movie } from '../../../state/movie.state';

type UiActions = { paginate: boolean };

@Component({
  standalone: true,
  imports: [
    RouterLink,
    StarRatingComponent,
    ElementVisibilityDirective,
    FastSvgComponent,
    GridListComponent,
    NgOptimizedImage,
  ],
  selector: 'ui-movie-list',
  template: `
    @if (moviesListVisible()) {
      <ui-grid-list>
        <!--
            **🚀 Perf Tip for TBT:**
            Use \`@for\` to keep rendering non-blocking instead of relying on \`ngFor\` or \`rxFor\`.
            Angular's new render loops work with signals as long as the input stays pure.
        -->
        @for (movie of movieItems(); track trackByMovieId($index, movie); let idx = $index) {
          <a
            class="ui-grid-list-item"
            [routerLink]="['/detail/movie', movie.id]"
            [attr.data-uf]="'movie-' + idx"
          >
            <!--
              **🚀 Perf Tip for LCP:**
              Prefer the native HTML attribute loading="lazy" instead of an extra directive.
              This cuts bootstrap and template evaluation cost.
            -->
            <img
              [ngSrc]="movie.imgSrc"
              [ngSrcset]="movie.imgSrcset"
              [sizes]="movie.imgSizes"
              [priority]="idx < numPriority()"
              class="aspectRatio-2-3 gradient"
              [width]="movie.imgWidth"
              [height]="movie.imgHeight"
              alt="poster movie"
              [title]="movie.title"
            />
            <div class="movies-list--details">
              <h3 class="movies-list--details-title">
                {{ movie.title }}
              </h3>
              <ui-star-rating [rating]="movie.vote_average"></ui-star-rating>
            </div>
          </a>
        }
        <!-- If this element is visible in the viewport the paginate event fires -->
        <div (elementVisibility)="ui.paginate($event)"></div>
      </ui-grid-list>
    }
    @else {
      <div style="display: flex; align-items: center;">
        <span style="font-size: 1.5rem">No results</span>
        <fast-svg name="sad"></fast-svg>
      </div>
    }
  `,
  styleUrls: ['./movie-list.component.scss'],
  providers: [RxState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export class MovieListComponent {
  private readonly state =
    inject<RxState<{ movies?: Movie[]; numPriority: number }>>(RxState);
  ui = rxActions<UiActions>();

  numPriority() {
    return this.state.get('numPriority');
  }

  @Input()
  set withImgPriority(p: number) {
    if (p) {
      this.state.set({numPriority: p});
    } else {
      this.state.set({numPriority: 0});
    }
  }

  readonly movies$ = this.state.select('movies') as Observable<Movie[]>;
  readonly movieItems = toSignal(this.movies$, { initialValue: [] as Movie[] });

  // if no movies are given we don't need to render nor listen for the infinite scroll trigger
  readonly moviesListVisible = toSignal(
    this.state.select(map((state) => !!state.movies && state.movies.length > 0)),
    { initialValue: false }
  );

  @Input({required: true})
  set movies(movies$: RxInputType<Movie[]>) {
    this.state.connect('movies', coerceObservable(movies$));
  }

  // emit paginate event only if element is visible (true)
  @Output() readonly paginate: Observable<true> = this.ui.paginate$.pipe(
    filter(Boolean)
  );

  constructor() {
    this.state.set({ numPriority: 2 });
  }

  trackByMovieId(_: number, movie: Movie) {
    return movie.id;
  }
}
