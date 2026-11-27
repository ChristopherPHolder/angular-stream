import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, Service, inject, signal } from '@angular/core';

export type DemoEventKind = 'shell' | 'boot' | 'chunk' | 'hydrate' | 'end';

export interface DemoEvent {
  /** Milliseconds since navigation started. */
  at: number;
  kind: DemoEventKind;
  text: string;
}

/** What the instrumentation script in index.html puts on `window`. */
interface DemoRecorder {
  events: DemoEvent[];
  log(kind: DemoEventKind, text: string): void;
}

function recorder(): DemoRecorder | undefined {
  return (globalThis as { __demo?: DemoRecorder }).__demo;
}

/** Adds an entry to the event log. Does nothing on the server. */
export function logDemoEvent(kind: DemoEventKind, text: string): void {
  recorder()?.log(kind, text);
}

/**
 * The events recorded so far. Recording starts in index.html, before the
 * shell's own scripts run; this only reads it, so events from before Angular
 * started are kept.
 */
@Service()
export class DemoEvents {
  readonly events = signal<DemoEvent[]>([]);

  constructor() {
    const demo = recorder();
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || demo === undefined) {
      return;
    }

    const sync = () => this.events.set([...demo.events]);
    sync();
    window.addEventListener('demo-event', sync);
  }
}

const LABELS: Record<DemoEventKind, string> = {
  shell: 'shell',
  boot: 'angular',
  chunk: 'chunk',
  hydrate: 'hydrated',
  end: 'done',
};

@Component({
  selector: 'demo-event-log',
  template: `
    <h2 class="text-card-title">Event log</h2>
    <p class="hint">Milliseconds since the navigation started.</p>
    @if (events().length === 0) {
      <p class="empty">
        Nothing to show yet. The server sent this panel empty. Angular fills it in once it starts,
        including what happened before that.
      </p>
    } @else {
      <ol>
        @for (event of events(); track $index) {
          <li>
            <span class="at">{{ event.at }} ms</span>
            <span class="kind" [class]="'kind kind--' + event.kind">{{ label(event) }}</span>
            <span class="text">{{ event.text }}</span>
          </li>
        }
      </ol>
    }
  `,
  styleUrl: './event-log.css',
})
export class EventLog {
  protected readonly events = inject(DemoEvents).events;

  protected label(event: DemoEvent): string {
    return LABELS[event.kind];
  }
}
