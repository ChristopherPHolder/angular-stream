import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FastSvgComponent } from '@push-based/ngx-fast-svg';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ListDetailAdapter } from './list-detail-page.adapter';

@Component({
  standalone: true,
  imports: [
    RouterLink,
    RouterOutlet,
    FastSvgComponent,
    RouterLinkActive,
  ],
  selector: 'ct-list-detail-page',
  templateUrl: './list-detail-page.component.html',
  styleUrls: ['./list-detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ListDetailPageComponent {
  public readonly adapter = inject(ListDetailAdapter);
  readonly listName = toSignal(this.adapter.listName$, {
    initialValue: 'Loading...',
  });
  readonly tabs = [
    {
      name: 'View List',
      link: 'view',
    },
    {
      name: 'Edit List',
      link: 'edit',
    },
    {
      name: 'Add/Remove Items',
      link: 'add-remove-items',
    },
    {
      name: 'Choose Image',
      link: 'image',
    },
    {
      name: 'Delete List',
      link: 'delete',
    },
  ];
}
