import {
  Component,
  ViewEncapsulation,
} from '@angular/core';

@Component({
  selector: 'ui-hamburger-button',
  templateUrl: './hamburger-button.component.html',
  styleUrls: ['./hamburger-button.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
  host: {
    class: 'hamburger-button',
  },
})
export class HamburgerButtonComponent {}
