import { isPlatformBrowser } from '@angular/common';
import {
  type HttpBackend,
  type HttpEvent,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { type Observable, map, timer } from 'rxjs';

/** What the widget's request returns. */
export interface WidgetData {
  /** How long the API took to answer, in milliseconds. */
  delayMs: number;
  /** Where the response was produced: always the server, when streaming works. */
  answeredBy: 'server' | 'browser';
}

/** How long the widget's data takes to arrive. */
export const EXAMPLE_DELAY_MS = 2000;

/**
 * A fake API inside the app, on the server and in the browser: it answers
 * every request after the `delay` the URL asks for. Requests still go through
 * `HttpClient` and its interceptors, so the streaming renderer tracks them and
 * the transfer cache stores them as it would for a real API.
 */
@Service()
export class ExampleBackend implements HttpBackend {
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const url = new URL(request.urlWithParams, 'http://example.invalid');
    const delayMs = Number(url.searchParams.get('delay') ?? 0);
    const body: WidgetData = { delayMs, answeredBy: this.inBrowser ? 'browser' : 'server' };

    return timer(delayMs).pipe(
      map(() => new HttpResponse({ status: 200, url: request.urlWithParams, body })),
    );
  }
}
