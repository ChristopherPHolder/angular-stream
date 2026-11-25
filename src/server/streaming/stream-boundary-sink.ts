import type {
  StreamBoundaryPayload,
  StreamBoundarySink,
} from '../../app/streaming/stream-boundary.directive';
import { validateBoundaryId } from '../../app/streaming/stream-boundary.directive';

/**
 * Collects boundary payloads for a single request.
 *
 * One instance is provided per render through the platform injector, so
 * concurrent renders in the same isolate cannot see each other's boundaries.
 * That is why this is a request-scoped object rather than module state — an
 * important difference from Analog's streaming, which reaches for
 * `AsyncLocalStorage` and therefore needs the `nodejs_als` compatibility flag
 * on workerd.
 *
 * Payloads emitted before the renderer subscribes are buffered, because a
 * boundary can resolve during the very first change detection pass, before the
 * response stream exists.
 */
export class RequestStreamBoundarySink implements StreamBoundarySink {
  private readonly boundaries = new Map<string, boolean>();
  private bufferedPayloads: StreamBoundaryPayload[] = [];
  private listener: ((payload: StreamBoundaryPayload) => void) | undefined;
  private subscribed = false;

  register(id: string): void {
    validateBoundaryId(id);
    if (this.boundaries.has(id)) {
      throw new Error(`Duplicate stream boundary registration: "${id}"`);
    }

    this.boundaries.set(id, false);
  }

  emit(payload: StreamBoundaryPayload): void {
    validateBoundaryId(payload.id);
    const emitted = this.boundaries.get(payload.id);
    if (emitted === undefined) {
      throw new Error(`Unregistered stream boundary emission: "${payload.id}"`);
    }
    if (emitted) {
      throw new Error(`Duplicate stream boundary emission: "${payload.id}"`);
    }

    this.boundaries.set(payload.id, true);
    if (this.listener === undefined) {
      this.bufferedPayloads.push(payload);
      return;
    }

    this.listener(payload);
  }

  subscribe(listener: (payload: StreamBoundaryPayload) => void): void {
    if (this.subscribed) {
      throw new Error('The stream boundary sink already has a subscriber');
    }

    this.subscribed = true;
    this.listener = listener;
    const bufferedPayloads = this.bufferedPayloads;
    this.bufferedPayloads = [];
    for (const payload of bufferedPayloads) {
      listener(payload);
    }
  }

  /**
   * Registered boundaries that never became ready.
   *
   * Deliberately not an assertion. The POC threw here, but by this point the
   * shell has already been committed to the wire, so throwing would truncate
   * an otherwise fine response. The authoritative document that follows
   * contains every boundary's real markup regardless, so a pending boundary is
   * a missed paint optimisation, not a correctness problem — worth a warning,
   * not a failed request.
   */
  pending(): string[] {
    return [...this.boundaries]
      .filter(([, emitted]) => !emitted)
      .map(([id]) => id);
  }
}
