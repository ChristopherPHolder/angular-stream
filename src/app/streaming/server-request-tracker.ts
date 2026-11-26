import { InjectionToken } from '@angular/core';

/**
 * Follows the HTTP requests a streamed server render has in flight.
 *
 * The streaming renderer turns off Angular's own HTTP stability tracking, so
 * that `whenStable()` means "the route and its `@defer` blocks are in place"
 * rather than "every TMDB call has answered". That lets the shell go out
 * while data is still loading. This tracker is what the renderer waits on
 * instead, and what tells the client which requests are worth waiting for.
 */
export interface ServerRequestTracker {
  /** Marks one request as started; the returned function marks it finished. */
  track(key: string): () => void;
}

/** Only the streaming renderer provides this. */
export const SERVER_REQUEST_TRACKER = new InjectionToken<ServerRequestTracker>(
  'SERVER_REQUEST_TRACKER',
);
