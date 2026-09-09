import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DelayedBoundaryState } from './streaming/delayed-boundary.state';

@Component({
  selector: 'app-root',
  template: `
    <main>
      <p data-testid="ssr-marker">Rendered by the streamed Angular SSR POC</p>
      <p>
        Counter: <strong>{{ count() }}</strong>
      </p>
      <button type="button" (click)="increment()">Increment counter</button>
    </main>
  `,
  styles: `
    :host {
      display: block;
      font-family: system-ui, sans-serif;
    }

    main {
      max-width: 40rem;
      margin: 4rem auto;
      padding: 2rem;
      border: 1px solid #d0d7de;
      border-radius: 0.75rem;
    }

    button {
      padding: 0.625rem 1rem;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly delayedBoundaryState = inject(DelayedBoundaryState);
  protected readonly count = signal(0);

  protected increment(): void {
    this.count.update((count) => count + 1);
  }
}

// Legacy implementation retained for reference.
// import { ChangeDetectionStrategy, Component } from '@angular/core';
// import { RouterOutlet } from '@angular/router';
// import { AppShellComponent } from './app-shell/app-shell.component';
//
// @Component({
//   selector: 'app-root',
//   template: `
//     <app-shell>
//       <router-outlet />
//     </app-shell>
//   `,
//   standalone: true,
//   imports: [RouterOutlet, AppShellComponent],
//   changeDetection: ChangeDetectionStrategy.OnPush,
// })
// export class App {}
