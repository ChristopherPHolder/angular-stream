import { selectSlice } from '@rx-angular/state/selections';
import { Location, NgOptimizedImage } from '@angular/common';
import {
  Component,
  ElementRef,
  inject,
  ViewEncapsulation,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, mergeWith } from 'rxjs';
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
          selectSlice(['value'], { value: ({ video }) => video }),
        ),
      ),
      map((e) => e === 'load'),
    ),
    { initialValue: false },
  );
  readonly movie = toSignal(
    // Do not filter out empty emissions: when navigating between movies the
    // selector emits `null` while the next movie loads. Letting that through
    // clears the previously shown movie instead of leaving it on screen until
    // the new one arrives.
    this.movieCtx$.pipe(map((ctx) => ctx?.value || null)),
  );
  readonly castList = toSignal(
    this.adapter.movieCastById$.pipe(
      map((ctx) => ({
        value: ctx.value ?? [],
        loading: ctx.loading,
      })),
    ),
    {
      initialValue: {
        value: [] as MovieCast[],
        loading: true,
      } satisfies CastListContext,
    },
  );
  readonly recommendations = toSignal(
    this.adapter.infiniteScrollRecommendations$.pipe(
      map((ctx) => ({
        results: ctx.results ?? [],
        loading: ctx.loading,
      })),
    ),
    {
      initialValue: {
        results: [] as Movie[],
        loading: true,
      } satisfies RecommendationContext,
    },
  );

  readonly trailerDialog = viewChild<ElementRef>('trailerDialog');

  readonly castListWrapper = viewChild<ElementRef<HTMLElement>>('castListWrapper');

  constructor() {
    this.effects.register(
      this.ui.dialog$.pipe(map((v) => v === 'show')),
      (openDialog) =>
        openDialog
          ? this.trailerDialog()?.nativeElement?.showModal()
          : this.trailerDialog()?.nativeElement.close(),
    );
  }

  move(increment: number) {
    const castListWrapper = this.castListWrapper();
    if (castListWrapper) {
      const scrollLeft = castListWrapper.nativeElement.scrollLeft;
      const newScrollLetf = scrollLeft - increment;
      castListWrapper.nativeElement.scrollLeft =
        newScrollLetf > 0
          ? Math.max(0, newScrollLetf)
          : Math.min(newScrollLetf, castListWrapper.nativeElement.children.length * increment);
    }
  }

  back() {
    this.location.back();
  }

  paginateRecommendations() {
    this.adapter.paginateRecommendations();
  }
}
