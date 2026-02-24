import { rxState } from '@rx-angular/state';
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
import { RxIf } from '@rx-angular/template/if';
import { AccountState } from '../../state/account.state';


@Component({
  standalone: true,
  imports: [RouterLink, RxIf],
  selector: 'ct-account-menu',
  templateUrl: './account-menu.component.html',
  styleUrls: ['./account-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export default class AccountMenuComponent {
  private readonly authEffects = inject(AuthEffects);
  private readonly accountState = inject(AccountState);
  private readonly state = rxState<{ loggedIn: boolean }>(({ connect }) => {
    connect('loggedIn', this.accountState.loggedIn$);
  });

  ui = rxActions<{ signOut: Event; signIn: Event; }>();

  loggedIn$ = this.state.select('loggedIn');

  constructor() {
    rxEffects(({ register }) => {
      register(this.ui.signOut$, this.authEffects.signOut);
      register(this.ui.signIn$, this.authEffects.signInStart);
    });
  }
}
