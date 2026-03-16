import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { rxActions } from '@rx-angular/state/actions';
import { AuthEffects } from '../../auth/auth.effects';
import { RouterLink } from '@angular/router';
import { rxEffects } from '@rx-angular/state/effects';
import { AccountState } from '../../state/account.state';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  standalone: true,
  imports: [RouterLink],
  selector: 'ct-account-menu',
  templateUrl: './account-menu.component.html',
  styleUrls: ['./account-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export default class AccountMenuComponent {
  private readonly authEffects = inject(AuthEffects);
  private readonly accountState = inject(AccountState);
  protected readonly loggedIn = toSignal(this.accountState.loggedIn$);

  ui = rxActions<{ signOut: Event; signIn: Event }>();

  constructor() {
    rxEffects(({ register }) => {
      register(this.ui.signOut$, this.authEffects.signOut);
      register(this.ui.signIn$, this.authEffects.signInStart);
    });
  }
}
