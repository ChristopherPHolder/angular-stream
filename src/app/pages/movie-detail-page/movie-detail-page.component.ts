import { selectSlice } from '@rx-angular/state/selections';
import { Location, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  TrackByFunction,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, mergeWith, tap } from 'rxjs';
import { TMDBMovieGenreModel } from '../../data-access/api/model/movie-genre.model';

import { MovieCast, MovieDetailAdapter } from './movie-detail-page.adapter';
import { rxActions } from '@rx-angular/state/actions';
import { rxEffects } from '@rx-angular/state/effects';
import { DetailGridComponent } from '../../ui/component/detail-grid/detail-grid.component';
import { StarRatingComponent } from '../../ui/pattern/star-rating/star-rating.component';
import { MovieListComponent } from '../../ui/pattern/movie-list/movie-list.component';
import { BypassSrcDirective } from '../../shared/cdk/bypass-src.directive';
import { FastSvgComponent } from '@push-based/ngx-fast-svg';
import { RouterLink } from '@angular/router';
import { Movie } from '../../state/movie.state';

type CastListContext = {
  value: MovieCast[];
  loading: boolean;
};

type RecommendationContext = {
  results: Movie[];
  loading: boolean;
};

@Component({
  standalone: true,
  imports: [
    RouterLink,
    NgOptimizedImage,
    DetailGridComponent,
    StarRatingComponent,
    MovieListComponent,
    BypassSrcDirective,
    FastSvgComponent,
  ],
  selector: 'ct-movie',
  templateUrl: './movie-detail-page.component.html',
  styleUrls: ['./movie-detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export default class MovieDetailPageComponent {
  private readonly location = inject(Location);
  private readonly adapter = inject(MovieDetailAdapter);
  private readonly effects = rxEffects();

  private readonly movieCtx$ = this.adapter.routedMovieCtx$;
  readonly ui = rxActions<{
    dialog: 'show' | 'close';
    iframe: 'load' | 'unload';
  }>();
  readonly loadIframe = toSignal(
    this.ui.iframe$.pipe(
      mergeWith(
        this.movieCtx$.pipe(
          // select changes of video nested property
          selectSlice(['value'], { value: ({ video }) => video })
        )
      ),
      map((e) => e === 'load')
    ),
    { initialValue: false }
  );
  readonly movie = toSignal(
    this.movieCtx$.pipe(
      map((ctx) => ctx?.value || null),
      filter((movie) => !!movie)
    )
  );
  readonly castList = toSignal(
    this.adapter.movieCastById$.pipe(
      map((ctx) => ({
        value: ctx.value ?? [],
        loading: ctx.loading,
      }))
    ),
    {
      initialValue: {
        value: [] as MovieCast[],
        loading: true,
      } satisfies CastListContext,
    }
  );
  readonly recommendations = toSignal(
    this.adapter.infiniteScrollRecommendations$.pipe(
      map((ctx) => ({
        results: ctx.results ?? [],
        loading: ctx.loading,
      }))
    ),
    {
      initialValue: {
        results: [] as Movie[],
        loading: true,
      } satisfies RecommendationContext,
    }
  );

  @ViewChild('trailerDialog')
  trailerDialog: ElementRef | undefined = undefined;

  @ViewChild('castListWrapper')
  castListWrapper: ElementRef<HTMLElement> | undefined = undefined;

  constructor() {
    this.effects.register(
      this.ui.dialog$.pipe(
        map((v) => v === 'show'),
        tap(console.log)
      ),
      (openDialog) =>
        openDialog
          ? this.trailerDialog?.nativeElement?.showModal()
          : this.trailerDialog?.nativeElement.close()
    );
  }

  move(increment: number) {
    if (this.castListWrapper) {
      const scrollLeft = this.castListWrapper.nativeElement.scrollLeft;
      const newScrollLetf = scrollLeft - increment;
      this.castListWrapper.nativeElement.scrollLeft =
        newScrollLetf > 0
          ? Math.max(0, newScrollLetf)
          : Math.min(
              newScrollLetf,
              this.castListWrapper.nativeElement.children.length * increment
            );
    }
  }

  back() {
    this.location.back();
  }

  paginateRecommendations() {
    this.adapter.paginateRecommendations();
  }

  trackByGenre: TrackByFunction<TMDBMovieGenreModel> = (_, genre) => genre.name;
  trackByCast: TrackByFunction<MovieCast> = (_, cast) => cast.cast_id;
}
