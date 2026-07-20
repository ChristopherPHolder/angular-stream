import { isPlatformBrowser } from '@angular/common';
import {
  inject,
  Injectable,
  PendingTasks,
  PLATFORM_ID,
  signal,
} from '@angular/core';

export const DELAYED_BOUNDARY_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class DelayedBoundaryState {
  private readonly pendingTasks = inject(PendingTasks);
  private readonly readyState = signal(isPlatformBrowser(inject(PLATFORM_ID)));

  readonly ready = this.readyState.asReadonly();

  constructor() {
    if (this.readyState()) {
      return;
    }

    this.pendingTasks.run(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, DELAYED_BOUNDARY_MS);
      });
      this.readyState.set(true);
    });
  }
}
