import { Component, model, ViewEncapsulation } from '@angular/core';

import { BackdropComponent } from '../backdrop/backdrop.component';

@Component({
  imports: [BackdropComponent],
  selector: 'ui-side-drawer',
  template: `
    <ui-backdrop (click)="opened.set(false)" [opened]="opened()"></ui-backdrop>
    <div class="side-drawer" [class.opened]="opened()">
      <ng-content></ng-content>
    </div>
  `,
  styleUrls: ['./side-drawer.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
})
export class SideDrawerComponent {
  readonly opened = model(false);
}
