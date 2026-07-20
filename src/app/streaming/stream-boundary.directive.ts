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

export const STREAM_BOUNDARY_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export interface StreamBoundaryPayload {
  id: string;
  html: string;
}

export interface StreamBoundarySink {
  register(id: string): void;
  emit(payload: StreamBoundaryPayload): void;
  subscribe(listener: (payload: StreamBoundaryPayload) => void): void;
  assertComplete(): void;
}

export const STREAM_BOUNDARY_SINK = new InjectionToken<StreamBoundarySink>(
  'STREAM_BOUNDARY_SINK'
);

@Directive({
  // The transport contract deliberately uses this public, unprefixed attribute.
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[streamBoundary]',
  host: {
    '[attr.data-stream-boundary]': 'boundaryId',
  },
})
export class StreamBoundaryDirective implements OnInit, AfterViewChecked {
  readonly streamBoundaryReady = input.required<boolean>();

  protected readonly boundaryId = validateBoundaryId(
    inject(new HostAttributeToken('streamBoundary'))
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

    this.sink.emit({
      id: this.boundaryId,
      html: this.host.nativeElement.outerHTML,
    });
    this.emitted = true;
  }
}

export function validateBoundaryId(id: string): string {
  if (!STREAM_BOUNDARY_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid stream boundary ID "${id}"; expected ${STREAM_BOUNDARY_ID_PATTERN.source}`
    );
  }

  return id;
}
