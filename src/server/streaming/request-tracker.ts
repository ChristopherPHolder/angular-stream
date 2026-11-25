import type { ServerRequestTracker } from '../../app/streaming/server-request-tracker';

/**
 * The request-scoped counter behind `SERVER_REQUEST_TRACKER`. One per render,
 * like the boundary sink, so concurrent renders in the same isolate never see
 * each other's requests.
 */
export class RequestTracker implements ServerRequestTracker {
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  track(): () => void {
    this.inFlight++;
    let finished = false;

    return () => {
      if (finished) {
        return;
      }

      finished = true;
      this.inFlight--;
      if (this.inFlight === 0) {
        const waiters = this.waiters;
        this.waiters = [];
        for (const resolve of waiters) {
          resolve();
        }
      }
    };
  }

  get idle(): boolean {
    return this.inFlight === 0;
  }

  /** Resolves once no request is in flight, immediately if none is. */
  whenIdle(): Promise<void> {
    return this.idle
      ? Promise.resolve()
      : new Promise((resolve) => this.waiters.push(resolve));
  }
}
