import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ListDetailAdapter } from '../list-detail-page.adapter';
import { DOCUMENT } from '@angular/common';
// TODO
@Component({
  standalone: true,
  selector: 'ct-list-share',
  templateUrl: './list-share.component.html',
  styleUrls: ['./list-share.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListShareComponent implements OnInit, OnDestroy {
  public readonly body = inject(DOCUMENT).body;
  public readonly adapter = inject(ListDetailAdapter);
  readonly listName = toSignal(this.adapter.listName$, {
    initialValue: 'Loading...',
  });
  listRef = location.href;

  ngOnInit(): void {
    this.body.classList.add('modal-visible');
  }
  ngOnDestroy(): void {
    this.body.classList.remove('modal-visible');
  }
}
