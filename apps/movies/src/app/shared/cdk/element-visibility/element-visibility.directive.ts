import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, inject, output, PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { observeElementVisibility } from './observe-element-visibility';

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[elementVisibility]',
})
export class ElementVisibilityDirective {
  readonly elementVisibility = output<boolean>();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      observeElementVisibility(inject(ElementRef).nativeElement)
        .pipe(takeUntilDestroyed())
        .subscribe((visible) => this.elementVisibility.emit(visible));
    }
  }
}
