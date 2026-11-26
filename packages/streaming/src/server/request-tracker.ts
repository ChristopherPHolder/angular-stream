import type { ServerRequestTracker } from '../client/server-request-tracker';

/**
 * The request-scoped counter behind `SERVER_REQUEST_TRACKER`. One per render,
 * so concurrent renders in the same isolate never see each other's requests.
 */
export class RequestTracker implements ServerRequestTracker {
  private readonly inFlight = new Map<string, number>();
  private waiters: Array<() => void> = [];

  track(key: string): () => void {
    this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
    let finished = false;

    return () => {
      if (finished) {
        return;
      }

      finished = true;
      const remaining = (this.inFlight.get(key) ?? 1) - 1;
      if (remaining > 0) {
        this.inFlight.set(key, remaining);
      } else {
        this.inFlight.delete(key);
      }

      const waiters = this.waiters;
      this.waiters = [];
      for (const resolve of waiters) {
        resolve();
      }
    };
  }

  get idle(): boolean {
    return this.inFlight.size === 0;
  }

  /** Keys of the requests in flight right now. */
  pending(): string[] {
    return [...this.inFlight.keys()];
  }

  /** Resolves when the next request finishes, immediately if none is running. */
  nextCompletion(): Promise<void> {
    return this.idle ? Promise.resolve() : new Promise((resolve) => this.waiters.push(resolve));
  }
}
