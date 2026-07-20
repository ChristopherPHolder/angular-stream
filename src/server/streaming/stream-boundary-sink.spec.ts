import { describe, expect, it, vi } from 'vitest';
import { RequestStreamBoundarySink } from './stream-boundary-sink';

describe('RequestStreamBoundarySink', () => {
  it('replays buffered payloads before forwarding later payloads', () => {
    const sink = new RequestStreamBoundarySink();
    const listener = vi.fn();
    const first = { id: 'first', html: '<section>first</section>' };
    const second = { id: 'second', html: '<section>second</section>' };

    sink.register(first.id);
    sink.register(second.id);
    sink.emit(first);
    sink.subscribe(listener);
    sink.emit(second);

    expect(listener.mock.calls).toEqual([[first], [second]]);
  });

  it('rejects invalid and duplicate registrations', () => {
    const sink = new RequestStreamBoundarySink();

    expect(() => sink.register('not valid')).toThrow(
      'Invalid stream boundary ID'
    );
    sink.register('valid-id');
    expect(() => sink.register('valid-id')).toThrow(
      'Duplicate stream boundary registration'
    );
  });

  it('rejects unregistered and duplicate emissions', () => {
    const sink = new RequestStreamBoundarySink();
    const payload = { id: 'boundary', html: '<section></section>' };

    expect(() => sink.emit(payload)).toThrow(
      'Unregistered stream boundary emission'
    );
    sink.register(payload.id);
    sink.emit(payload);
    expect(() => sink.emit(payload)).toThrow(
      'Duplicate stream boundary emission'
    );
  });

  it('allows only one subscriber', () => {
    const sink = new RequestStreamBoundarySink();

    sink.subscribe(() => undefined);
    expect(() => sink.subscribe(() => undefined)).toThrow(
      'already has a subscriber'
    );
  });

  it('requires exactly one registered and emitted boundary at completion', () => {
    const emptySink = new RequestStreamBoundarySink();
    expect(() => emptySink.assertComplete()).toThrow(
      'exactly one registered stream boundary'
    );

    const pendingSink = new RequestStreamBoundarySink();
    pendingSink.register('pending');
    expect(() => pendingSink.assertComplete()).toThrow('did not emit');

    const completeSink = new RequestStreamBoundarySink();
    completeSink.register('complete');
    completeSink.emit({ id: 'complete', html: '<section></section>' });
    expect(() => completeSink.assertComplete()).not.toThrow();
  });
});
