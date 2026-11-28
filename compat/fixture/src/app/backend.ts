import { isPlatformBrowser } from '@angular/common';
import {
  type HttpBackend,
  type HttpEvent,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { type Observable, map, timer } from 'rxjs';

/** How long the widget's data takes to arrive. */
export const DELAY_MS = 2000;

export interface WidgetData {
  answeredBy: 'server' | 'browser';
}

/** A fake API inside the app: answers every request after `DELAY_MS`. */
@Injectable({ providedIn: 'root' })
export class FakeBackend implements HttpBackend {
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const body: WidgetData = { answeredBy: this.inBrowser ? 'browser' : 'server' };
    return timer(DELAY_MS).pipe(
      map(() => new HttpResponse({ status: 200, url: request.urlWithParams, body })),
    );
  }
}
