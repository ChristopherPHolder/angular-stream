import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  STREAM_BOUNDARY_SINK,
  StreamBoundaryDirective,
  StreamBoundarySink,
} from './stream-boundary.directive';

@Component({
  imports: [StreamBoundaryDirective],
  template: `
    <section streamBoundary="test-boundary" [streamBoundaryReady]="ready()">
      @if (ready()) {
      <p data-testid="ready">ready</p>
      } @else {
      <p data-testid="placeholder">waiting</p>
      }
    </section>
  `,
})
class TestHost {
  readonly ready = signal(false);
}

describe('StreamBoundaryDirective', () => {
  it('registers its static ID and emits the checked ready host once', () => {
    const sink: StreamBoundarySink = {
      register: vi.fn(),
      emit: vi.fn(),
      subscribe: vi.fn(),
      assertComplete: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: STREAM_BOUNDARY_SINK, useValue: sink }],
    });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();
    expect(sink.register).toHaveBeenCalledWith('test-boundary');
    expect(sink.emit).not.toHaveBeenCalled();

    fixture.componentInstance.ready.set(true);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(sink.emit).toHaveBeenCalledTimes(1);
    expect(sink.emit).toHaveBeenCalledWith({
      id: 'test-boundary',
      html: expect.stringContaining('data-testid="ready"'),
    });
    expect(fixture.nativeElement.innerHTML).toContain(
      'data-stream-boundary="test-boundary"'
    );
  });

  it('does not participate in transport when no sink is provided', () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();
    fixture.componentInstance.ready.set(true);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.innerHTML).toContain('data-testid="ready"');
  });
});
