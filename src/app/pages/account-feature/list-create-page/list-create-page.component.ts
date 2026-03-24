import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ListCreatePageAdapter } from './list-create-page.adapter';

@Component({
  standalone: true,
  imports: [],
  template: `
    <article>
      @if (showHeader()) {
        <header>
          <h1>Create new list</h1>
        </header>
      }
      <form>
        <fieldset>
          <label for="list-name"> Name </label>
          <input
            id="list-name"
            #nameInput
            type="text"
            [value]="name()"
            (input)="adapter.ui.update({ name: nameInput.value })"
          />
        </fieldset>

        <fieldset>
          <label for="list-description"> Description </label>
          <textarea
            id="list-description"
            #descriptionInput
            (input)="adapter.ui.update({ description: descriptionInput.value })"
            rows="8"
            >{{ description() }}</textarea
          >
        </fieldset>

        <fieldset>
          <label for="list-privacy"> Private </label>
          <div class="select-wrapper">
            <select
              id="list-privacy"
              class="select"
              #privateInput
              (change)="adapter.ui.update({ private: privateInput.value })"
            >
              <option [selected]="isPrivate()" [value]="true">Yes</option>
              <option [selected]="!isPrivate()" [value]="false">No</option>
            </select>
          </div>
        </fieldset>
      </form>
      <button
        [disabled]="!valid()"
        (click)="adapter.ui.submit()"
        class="btn primary-button"
        name="save"
        aria-label="Save list"
      >
        Save
      </button>
    </article>
  `,
  styleUrls: [
    './list-create-page.component.scss',
    '../../../ui/component/button/_button.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ListCreateEditPageComponent implements OnDestroy {
  public readonly adapter = inject(ListCreatePageAdapter);
  readonly showHeader = toSignal(this.adapter.showHeader$, { initialValue: false });
  readonly name = toSignal(this.adapter.name$, { initialValue: '' });
  readonly description = toSignal(this.adapter.description$, { initialValue: '' });
  readonly isPrivate = toSignal(this.adapter.private$, { initialValue: true });
  readonly valid = toSignal(this.adapter.valid$, { initialValue: false });

  ngOnDestroy(): void {
    this.adapter.resetForm();
  }
}
