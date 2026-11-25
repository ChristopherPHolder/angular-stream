import { Component, ViewEncapsulation, input } from '@angular/core';

@Component({
  selector: 'ui-backdrop',
  template: ``,
  styleUrls: ['./backdrop.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
  host: {
    '[class.opened]': 'opened()',
  },
})
export class BackdropComponent {
  readonly opened = input.required<boolean>();
}
