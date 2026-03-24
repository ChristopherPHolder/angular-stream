import { Location, NgClass, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PersonDetailAdapter } from './person-detail-page.adapter';
import { SORT_VALUES } from '../../data-access/api/sort/sort.data';
import { map, merge } from 'rxjs';
import { DetailGridComponent } from '../../ui/component/detail-grid/detail-grid.component';
import { MovieListComponent } from '../../ui/pattern/movie-list/movie-list.component';
import { FastSvgComponent } from '@push-based/ngx-fast-svg';
import { Movie } from '../../state/movie.state';

@Component({
  standalone: true,
  imports: [
    NgClass,
    NgOptimizedImage,
    DetailGridComponent,
    MovieListComponent,
    FastSvgComponent
],
  selector: 'ct-person',
  templateUrl: './person-detail-page.component.html',
  styleUrls: ['./person-detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export default class PersonDetailPageComponent {
  private readonly adapter = inject(PersonDetailAdapter);
  private readonly location = inject(Location);
  sortOptions = SORT_VALUES;
  readonly personCtx = toSignal(this.adapter.routedPersonCtx$, {
    initialValue: null,
  });
  readonly sortingModel = toSignal(this.adapter.sortingModel$, {
    initialValue: {
      activeSorting: this.sortOptions[0].name,
      showSorting: false,
    },
  });

  readonly sortBy = this.adapter.sortBy;
  readonly toggleSorting = this.adapter.toggleSorting;
  readonly infiniteScrollRecommendations = toSignal(
    merge(this.adapter.movieRecommendationsById$, this.adapter.sortingEvent$).pipe(
      map((ctx) => ({
        results: ctx.results ?? [],
        loading: ctx.loading,
      }))
    ),
    {
      initialValue: {
        results: [] as Movie[],
        loading: true,
      },
    }
  );

  constructor() {
    this.adapter.set({
      activeSorting: this.sortOptions[0].name,
      showSorting: false,
    });
  }

  paginate(): void {
    this.adapter.paginate();
  }

  back() {
    this.location.back();
  }
}
