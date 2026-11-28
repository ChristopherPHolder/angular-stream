import { Component, RESPONSE_INIT, inject } from '@angular/core';

/** Sets the status from inside the app, the way `@angular/ssr` documents it. */
@Component({
  selector: 'app-not-found',
  template: '<h1 data-not-found>Not found</h1>',
})
export class NotFound {
  constructor() {
    const init = inject(RESPONSE_INIT, { optional: true });
    if (init) {
      init.status = 404;
    }
  }
}
