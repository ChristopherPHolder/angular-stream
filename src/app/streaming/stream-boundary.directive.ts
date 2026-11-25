import {
  AfterViewChecked,
  Directive,
  ElementRef,
  HostAttributeToken,
  InjectionToken,
  OnInit,
  inject,
  input,
} from '@angular/core';

/**
 * Boundary ids are interpolated straight into the wire protocol's attributes
 * and comment markers, so they are restricted to a character set that needs no
 * escaping layer.
 */
export const STREAM_BOUNDARY_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export interface StreamBoundaryPayload {
  id: string;
  html: string;
}

export interface StreamBoundarySink {
  register(id: string): void;
  emit(payload: StreamBoundaryPayload): void;
  subscribe(listener: (payload: StreamBoundaryPayload) => void): void;
  /** Ids that were registered but never emitted. */
  pending(): string[];
}

export const STREAM_BOUNDARY_SINK = new InjectionToken<StreamBoundarySink>(
  'STREAM_BOUNDARY_SINK',
);

/**
 * Marks a subtree that the server may send after the shell.
 *
 * On the server the host is stamped with `data-stream-boundary`, which is both
 * the placeholder the streamed payload replaces and the handle the client
 * runtime looks it up by. The moment `streamBoundaryReady` turns true the
 * host's current `outerHTML` is handed to the sink, which frames it into the
 * open response.
 *
 * In the browser the sink is absent, so this is inert: it stamps the attribute
 * and does nothing else.
 *
 * What is emitted here is **preview only**. Angular's authoritative,
 * hydration-annotated document is rendered separately once the application is
 * stable and replaces the whole preview DOM before bootstrap, so a boundary
 * that never becomes ready costs a slower paint and nothing else.
 */
@Directive({
  // The transport contract deliberately uses this public, unprefixed attribute.
  selector: '[streamBoundary]',
  host: {
    '[attr.data-stream-boundary]': 'boundaryId',
  },
})
export class StreamBoundaryDirective implements OnInit, AfterViewChecked {
  readonly streamBoundaryReady = input.required<boolean>();

  protected readonly boundaryId = validateBoundaryId(
    inject(new HostAttributeToken('streamBoundary')),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sink = inject(STREAM_BOUNDARY_SINK, { optional: true });
  private emitted = false;

  ngOnInit(): void {
    this.sink?.register(this.boundaryId);
  }

  ngAfterViewChecked(): void {
    if (this.sink === null || this.emitted || !this.streamBoundaryReady()) {
      return;
    }

    // Set before emitting: a throw downstream must not re-arm the boundary and
    // produce a duplicate frame on the next change detection pass.
    this.emitted = true;
    this.sink.emit({
      id: this.boundaryId,
      html: this.host.nativeElement.outerHTML,
    });
  }
}

export function validateBoundaryId(id: string): string {
  if (!STREAM_BOUNDARY_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid stream boundary ID "${id}"; expected ${STREAM_BOUNDARY_ID_PATTERN.source}`,
    );
  }

  return id;
}
