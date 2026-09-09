import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppShellComponent } from './app-shell/app-shell.component';

@Component({
  selector: 'app-root',
  template: `
    <app-shell>
      <router-outlet />
    </app-shell>
  `,
  standalone: true,
  imports: [RouterOutlet, AppShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}





