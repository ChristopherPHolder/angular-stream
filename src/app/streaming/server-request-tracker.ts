import { HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { defer, finalize } from 'rxjs';

/**
 * Counts HTTP requests in flight during a streamed server render.
 *
 * The streaming renderer turns off Angular's own HTTP stability tracking, so
 * that `whenStable()` means "the route and its `@defer` blocks are in place"
 * rather than "every TMDB call has answered". That lets the shell go out with
 * every boundary placeholder in it while data is still loading. This tracker
 * is what the renderer then waits on, together with `whenStable()`, before it
 * renders the authoritative document.
 */
export interface ServerRequestTracker {
  /** Marks one request as started; the returned function marks it finished. */
  track(): () => void;
}

export const SERVER_REQUEST_TRACKER = new InjectionToken<ServerRequestTracker>(
  'SERVER_REQUEST_TRACKER',
);

/**
 * Reports each request to the tracker, when there is one. Only the streaming
 * renderer provides it, so this does nothing in the browser and in the
 * buffered fallback render.
 */
export const trackServerRequests: HttpInterceptorFn = (req, next) => {
  const tracker = inject(SERVER_REQUEST_TRACKER, { optional: true });
  if (tracker === null) {
    return next(req);
  }

  return defer(() => {
    const done = tracker.track();
    return next(req).pipe(finalize(done));
  });
};
