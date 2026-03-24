import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { trackByProp } from '../../../shared/cdk/track-by';
import {
  AccountListPageAdapter,
  ListWithPoster,
} from './account-list-page.adapter';
import { GridListComponent } from '../../../ui/component/grid-list/grid-list.component';
import { RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';

@Component({
  standalone: true,
  imports: [RouterLink, GridListComponent, NgOptimizedImage],
  selector: 'ct-person',
  templateUrl: './account-list-page.component.html',
  styleUrls: ['./account-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export default class AccountListPageComponent {
  private readonly adapter = inject(AccountListPageAdapter);
  readonly lists = toSignal(this.adapter.select('lists'), {
    initialValue: [],
  });
  readonly trackById = trackByProp<ListWithPoster>('id');
}
