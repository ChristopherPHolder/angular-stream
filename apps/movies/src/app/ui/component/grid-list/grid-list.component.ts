import { Component } from '@angular/core';

@Component({
  selector: 'ui-grid-list',
  template: `
    <ng-content select=".ui-grid-list-item"></ng-content>
    <ng-content></ng-content>
  `,
  styleUrls: ['./grid-list.component.scss'],
})
export class GridListComponent {}
