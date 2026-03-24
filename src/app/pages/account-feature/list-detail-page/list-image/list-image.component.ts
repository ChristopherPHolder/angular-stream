import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {trackByProp} from '../../../../shared/cdk/track-by';
import {ListDetailAdapter, ListPoster} from '../list-detail-page.adapter';
import {GridListComponent} from '../../../../ui/component/grid-list/grid-list.component';
import {NgOptimizedImage} from '@angular/common';

@Component({
  standalone: true,
  imports: [GridListComponent, NgOptimizedImage],
  selector: 'ct-list-image',
  templateUrl: './list-image.component.html',
  styleUrls: ['./list-image.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ListImageComponent {
  public adapter = inject(ListDetailAdapter);
  readonly posters = toSignal(this.adapter.posters$, {
    initialValue: [] as ListPoster[],
  });

  trackByPosterId = trackByProp<ListPoster>('id');
}
