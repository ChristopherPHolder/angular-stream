import { isPlatformBrowser } from '@angular/common';
import {
  type HttpBackend,
  type HttpEvent,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { PLATFORM_ID, Service, inject, signal } from '@angular/core';
import { type Observable, map, timer } from 'rxjs';

/** One piece of the demo's data. */
export interface StepData {
  step: Step;
  /** How long the server waited before answering. */
  delayMs: number;
  /** Where the response was produced: always the server, when streaming works. */
  answeredBy: 'server' | 'browser';
}

export type Step = 'a' | 'b' | 'c' | 'd';

/** How long each piece of data takes at normal speed, in milliseconds. */
export const STEP_DELAYS: Record<Step, number> = { a: 500, d: 800, b: 1200, c: 2000 };

/**
 * A fake API that lives inside the app, on the server and in the browser, so
 * the demo needs no network and every delay is under its control.
 *
 * It answers `GET /api/steps/<step>?delay=<ms>` after `delay` milliseconds.
 * Requests still go through `HttpClient` and its interceptors, so the
 * streaming renderer tracks them and the transfer cache stores them exactly as
 * it would for a real API.
 *
 * In the browser it also counts every request that actually reaches it. With
 * streaming working, that count stays at zero: each request is held until its
 * response arrives on the stream, then answered from transfer state.
 */
@Service()
export class DemoBackend implements HttpBackend {
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Requests the browser sent itself, rather than taking from the stream. */
  readonly browserRequests = signal(0);

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const url = new URL(request.urlWithParams, 'http://demo.invalid');
    const step = url.pathname.replace('/api/steps/', '') as Step;
    const delayMs = Number(url.searchParams.get('delay') ?? 0);

    if (this.inBrowser) {
      this.browserRequests.update((count) => count + 1);
    }

    const body: StepData = {
      step,
      delayMs,
      answeredBy: this.inBrowser ? 'browser' : 'server',
    };

    return timer(delayMs).pipe(
      map(() => new HttpResponse({ status: 200, url: request.urlWithParams, body })),
    );
  }
}
