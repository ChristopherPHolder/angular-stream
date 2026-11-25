import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  ViewEncapsulation,
  viewChild,
} from '@angular/core';
import { outputFromObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, fromEvent, map, merge, Observable, switchMap, take } from 'rxjs';
import { preventDefault, rxActions } from '@rx-angular/state/actions';
import { FastSvgComponent } from '@push-based/ngx-fast-svg';

type UiActions = {
  formClick: Event;
  formSubmit: Event;
};

@Component({
  imports: [FastSvgComponent],
  selector: 'ui-search-bar',
  template: `
    <form
      data-uf="q-form"
      (submit)="ui.formSubmit($event)"
      #form
      class="form"
      [tabIndex]="0"
      (focus)="ui.formClick($event)"
    >
      <button type="submit" class="magnifier-button" aria-label="Search for a movie">
        <fast-svg name="search" size="1.125em"></fast-svg>
      </button>
      <input
        data-uf="q"
        aria-label="Search Input"
        #searchInput
        [value]="search()"
        (change)="search.set(searchInput.value)"
        placeholder="Search for a movie..."
        class="input"
      />
    </form>
  `,
  styleUrls: ['search-bar.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
  host: {
    '[class.opened]': 'open()',
  },
})
export class SearchBarComponent {
  private readonly document = inject(DOCUMENT);

  readonly ui = rxActions<UiActions>(({ transforms }) =>
    transforms({ formSubmit: preventDefault }),
  );

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');
  private readonly formRef = viewChild.required<ElementRef<HTMLFormElement>>('form');

  readonly query = input('');

  /** Seeded from the routed query, then owned by whatever the user types. */
  protected readonly search = linkedSignal(() => this.query());

  protected readonly open = signal(false);

  readonly searchSubmit = outputFromObservable(
    this.ui.formSubmit$.pipe(map(() => this.search())),
  );

  private readonly closedFormClick$ = this.ui.formClick$.pipe(filter(() => !this.open()));

  /**
   * **🚀 Perf Tip for TBT, TTI:**
   *
   * We avoid `@HostListener('document')` as it would add an event listener on component bootstrap no matter if we need it or not.
   * This obviously will not scale.
   *
   * To avoid this we only listen to document click events after we clicked on the closed form.
   * If the needed event to close the form is received we stop listening to the document.
   *
   * This way we reduce the active event listeners to a minimum.
   */
  private readonly outsideOpenFormClick$ = this.closedFormClick$.pipe(
    switchMap(() => this.outsideClick().pipe(take(1))),
  );

  constructor() {
    merge(this.ui.formSubmit$, this.outsideOpenFormClick$)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.open.set(false));

    this.closedFormClick$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.open.set(true);
      this.inputRef().nativeElement.focus();
    });
  }

  private outsideClick(): Observable<Event> {
    // any click on the page (we can't use the option `once:true` as we might get multiple false trigger)
    return fromEvent(this.document, 'click').pipe(
      // forward if the form did NOT trigger the click
      // means we clicked somewhere else in the page but the form
      filter((e) => !this.formRef().nativeElement.contains(e.target as Node)),
    );
  }
}
