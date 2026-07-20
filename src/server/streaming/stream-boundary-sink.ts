import type {
  StreamBoundaryPayload,
  StreamBoundarySink,
} from '../../app/streaming/stream-boundary.directive';
import { validateBoundaryId } from '../../app/streaming/stream-boundary.directive';

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

  assertComplete(): void {
    if (this.boundaries.size !== 1) {
      throw new Error(
        `Expected exactly one registered stream boundary; received ${this.boundaries.size}`
      );
    }

    const [[id, emitted]] = this.boundaries;
    if (!emitted) {
      throw new Error(`Stream boundary "${id}" did not emit`);
    }
  }
}
