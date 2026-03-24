import {DOCUMENT} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {RxState} from '@rx-angular/state';

@Component({
  standalone: true,
  selector: 'ui-dark-mode-toggle',
  template: `
    <div class="dark-mode-toggle">
      <button
        aria-label="Enable dark mode"
        type="button"
        class="light"
        (click)="setChecked(true)"
      >
        ☀
      </button>

      <span class="toggle">
        <input
          class="toggle-track"
          type="checkbox"
          id="dark-mode"
          [checked]="!isLightTheme()"
          (change)="setChecked(!isLightTheme())"
        />
        <label style="color: transparent" for="dark-mode">
          Toggle Switch
        </label>
      </span>

      <button
        aria-label="Disable dark mode"
        type="button"
        class="dark"
        (click)="setChecked(false)"
      >
        ☾
      </button>
    </div>
  `,
  styleUrls: ['dark-mode-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export class DarkModeToggleComponent extends RxState<{
  isLightTheme: boolean;
}> {
  isLightTheme$ = this.select('isLightTheme');
  readonly isLightTheme = toSignal(this.isLightTheme$, { initialValue: true });
  private readonly document = inject(DOCUMENT);
  constructor() {
    super();
    this.set({ isLightTheme: true });
    this.hold(this.isLightTheme$, this.toggleTheme);
  }

  toggleTheme = (isLightTheme: boolean): void => {
    if (isLightTheme) {
      this.document.body.classList.remove('dark');
      this.document.body.classList.add('light');
    } else {
      this.document.body.classList.add('dark');
      this.document.body.classList.remove('light');
    }
  };

  setChecked(isLightTheme: boolean): void {
    this.set({ isLightTheme });
  }
}
