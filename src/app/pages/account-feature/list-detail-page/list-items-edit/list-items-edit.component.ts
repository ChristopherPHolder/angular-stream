import {ChangeDetectionStrategy, Component, inject,} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {TMDBMovieDetailsModel} from '../../../../data-access/api/model/movie-details.model';

import {trackByProp} from '../../../../shared/cdk/track-by';
import {ListItemsEditAdapter, MovieSearchResult,} from './list-items-edit.adapter';
import {FastSvgComponent} from '@push-based/ngx-fast-svg';
import {NgOptimizedImage} from '@angular/common';

@Component({
  standalone: true,
  imports: [NgOptimizedImage, FastSvgComponent],
  selector: 'ct-list-items-edit',
  templateUrl: './list-items-edit.component.html',
  styleUrls: ['./list-items-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ListItemsEditComponent {
  public readonly adapter = inject(ListItemsEditAdapter);

  readonly vm = toSignal(this.adapter.vm$, {
    initialValue: {
      items: [],
      searchResults: [],
      showResults: false,
      searchValue: '',
    },
  });

  trackByMovieId = trackByProp<MovieSearchResult>('id');
  trackByResultId = trackByProp<Partial<TMDBMovieDetailsModel>>('id');
}
