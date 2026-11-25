import { ɵREQUESTS_CONTRIBUTE_TO_STABILITY } from '@angular/common/http';
import { type ApplicationRef, mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  INITIAL_CONFIG,
  PlatformState,
  platformServer,
  ɵSERVER_CONTEXT,
  ɵrenderInternal,
} from '@angular/platform-server';
import { App } from '../../app/app';
import { config } from '../../app/app.config.server';
import { SERVER_REQUEST_TRACKER } from '../../app/streaming/server-request-tracker';
import { STREAM_BOUNDARY_SINK } from '../../app/streaming/stream-boundary.directive';
import { RequestTracker } from './request-tracker';
import {
  STREAM_BOUNDARY_PREVIEW_RUNTIME,
  frameFinalDocument,
  frameStreamBoundary,
} from './stream-boundary-protocol';
import { RequestStreamBoundarySink } from './stream-boundary-sink';

export interface StreamingAngularRenderOptions {
  document: string;
  url: string;
}

export interface OpenBodyDocument {
  shell: string;
  tail: string;
}

/**
 * Renders the application as a streamed response.
 *
 * The sequence, which is the whole point:
 *
 *  1. Bootstrap, then wait until the structure is stable: the initial
 *     navigation has finished, lazy routes are loaded and `@defer` blocks
 *     have rendered. HTTP requests don't count towards this (see
 *     `SERVER_REQUEST_TRACKER`), so it doesn't wait for TMDB. Without this
 *     wait the shell can be taken before a lazy route or a deferred boundary
 *     exists, and that boundary's frame then has no placeholder to land in.
 *  2. Serialize that shell with the module scripts detached, and send
 *     everything up to `</body>` plus the client runtime. The response is now
 *     open and the browser can paint.
 *  3. Frame each boundary into the open response as it becomes ready.
 *  4. Once the application is stable and no request is in flight, ask Angular
 *     for the authoritative, hydration-annotated document, send it, and close.
 *
 * Only step 4 is a hydration source. Steps 2 and 3 are preview markup that the
 * client runtime throws away when the authoritative document lands, which is
 * what keeps this clear of NG0500-series mismatches: Angular never hydrates
 * anything it did not serialize itself.
 *
 * Unlike `renderApplication`, nothing here waits for stability before the
 * first byte.
 */
export async function renderStreamingAngular({
  document,
  url,
}: StreamingAngularRenderOptions): Promise<Response> {
  const boundarySink = new RequestStreamBoundarySink();
  const requestTracker = new RequestTracker();
  const platformRef = platformServer([
    { provide: INITIAL_CONFIG, useValue: { document, url } },
    { provide: ɵSERVER_CONTEXT, useValue: 'streamed-ssr' },
    { provide: STREAM_BOUNDARY_SINK, useValue: boundarySink },
  ]);

  let destroyPromise: Promise<void> | undefined;
  let terminated = false;

  const destroyOnce = (): Promise<void> => {
    destroyPromise ??= destroyPlatform(platformRef);
    return destroyPromise;
  };

  try {
    const applicationRef = await bootstrapApplication(
      App,
      mergeApplicationConfig(config, {
        providers: [
          // HTTP leaves `whenStable()` to the tracker; see step 1 above.
          { provide: ɵREQUESTS_CONTRIBUTE_TO_STABILITY, useValue: false },
          { provide: SERVER_REQUEST_TRACKER, useValue: requestTracker },
        ],
      }),
      { platformRef },
    );
    await applicationRef.whenStable();
    const platformState = platformRef.injector.get(PlatformState);

    const previewDocument = renderWithoutModuleScripts(
      platformState.getDocument() as unknown as ServerDocument,
      () => platformState.renderToString(),
    );
    const { shell, tail } = splitOpenBodyDocument(previewDocument);

    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;

    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
      cancel() {
        // The client went away mid-render; stop and tear the platform down.
        terminated = true;
        return destroyOnce();
      },
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // The body is assembled across several flushes; a cached copy of a
        // partial response would be worse than no cache at all.
        'Cache-Control': 'no-store',
      },
    });

    controller.enqueue(encoder.encode(`${shell}${STREAM_BOUNDARY_PREVIEW_RUNTIME}`));

    const terminateAfterCommit = (error: unknown): Promise<void> => {
      if (terminated) {
        return destroyPromise ?? Promise.resolve();
      }

      terminated = true;
      console.error('[ssr] streaming render failed after commit', error);
      try {
        // Headers are long gone, so the only honest signal left is a broken
        // stream. The browser keeps whatever already painted.
        controller.error(error);
      } catch {
        // The stream may already be in a terminal state.
      }
      return destroyOnce();
    };

    boundarySink.subscribe((payload) => {
      if (terminated) {
        return;
      }

      try {
        controller.enqueue(encoder.encode(frameStreamBoundary(payload)));
      } catch (error) {
        void terminateAfterCommit(error);
      }
    });

    void (async () => {
      try {
        await whenSettled(applicationRef, requestTracker);
        if (terminated) {
          return;
        }

        const pending = boundarySink.pending();
        if (pending.length > 0) {
          console.warn(`[ssr] stream boundaries never became ready: ${pending.join(', ')}`);
        }

        const finalDocument = await ɵrenderInternal(platformRef, applicationRef);
        if (terminated) {
          return;
        }

        controller.enqueue(encoder.encode(`${frameFinalDocument(finalDocument)}${tail}`));
        controller.close();
        terminated = true;
        await destroyOnce();
      } catch (error) {
        if (terminated) {
          return;
        }

        await terminateAfterCommit(error);
      }
    })();

    return response;
  } catch (error) {
    // Nothing has been committed yet, so the caller can still fall back to a
    // buffered render and a real status code.
    terminated = true;
    await destroyOnce();
    throw error;
  }
}

/**
 * Splits the serialized document at the closing `</body>`, so the first flush
 * can leave the body open for boundary frames to be appended into.
 */
export function splitOpenBodyDocument(document: string): OpenBodyDocument {
  const terminalBodyIndex = document.toLowerCase().lastIndexOf('</body>');

  if (terminalBodyIndex === -1) {
    throw new Error('Rendered document is missing a terminal </body></html> tail');
  }

  const tail = document.slice(terminalBodyIndex);
  if (!/^<\/body>\s*<\/html>\s*$/i.test(tail)) {
    throw new Error('Rendered document has a malformed terminal </body></html> tail');
  }

  return { shell: document.slice(0, terminalBodyIndex), tail };
}

interface ServerNode {
  nextSibling: ServerNode | null;
  parentNode: ServerNode | null;
  insertBefore(node: ServerNode, referenceNode: ServerNode | null): void;
  removeChild(node: ServerNode): void;
}

interface ServerDocument {
  querySelectorAll(selector: string): ArrayLike<ServerNode>;
}

/**
 * Serializes the document with `<script type="module">` tags removed.
 *
 * The shell must not carry the application's entry points. If it did, the
 * browser would start fetching and then bootstrapping Angular against the
 * preview DOM, which is not hydration-annotated. The scripts come back in the
 * authoritative document at the end, and the client runtime activates them
 * only once that document is installed.
 *
 * The nodes are restored into the live document afterwards — the same
 * `PlatformState` is rendered again by `ɵrenderInternal`, so removing them
 * permanently would strip them from the authoritative output too.
 */
export function renderWithoutModuleScripts(
  document: ServerDocument,
  render: () => string,
): string {
  const detachedScripts: Array<{
    script: ServerNode;
    parent: ServerNode;
    nextSibling: ServerNode | null;
  }> = [];
  let renderedDocument!: string;
  let renderFailed = false;
  let renderError: unknown;

  try {
    for (const script of Array.from(document.querySelectorAll('script[type="module"]'))) {
      const parent = script.parentNode;
      if (parent === null) {
        continue;
      }

      const nextSibling = script.nextSibling;
      parent.removeChild(script);
      detachedScripts.push({ script, parent, nextSibling });
    }

    renderedDocument = render();
  } catch (error) {
    renderFailed = true;
    renderError = error;
  }

  // Restore in reverse so each `nextSibling` reference is back in place before
  // the node that was recorded against it.
  let restorationFailed = false;
  let restorationError: unknown;

  for (const { script, parent, nextSibling } of detachedScripts.reverse()) {
    try {
      parent.insertBefore(script, nextSibling);
    } catch (error) {
      if (!restorationFailed) {
        restorationFailed = true;
        restorationError = error;
      }
    }
  }

  if (restorationFailed) {
    throw restorationError;
  }

  if (renderFailed) {
    throw renderError;
  }

  return renderedDocument;
}

/**
 * Stable *and* no request in flight: what `whenStable()` alone means when
 * HTTP contributes to stability. A response can render more of the app,
 * which can start more requests, so check both until both hold at once.
 */
async function whenSettled(applicationRef: ApplicationRef, tracker: RequestTracker): Promise<void> {
  for (;;) {
    await applicationRef.whenStable();
    if (tracker.idle) {
      return;
    }

    await tracker.whenIdle();
  }
}

/**
 * Destroying synchronously inside the render's own microtask can tear down
 * providers that pending work still holds; a macrotask hop lets it settle.
 */
function destroyPlatform(platformRef: ReturnType<typeof platformServer>): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        platformRef.destroy();
      } catch (error) {
        console.error('[ssr] platform destroy failed', error);
      }
      resolve();
    }, 0);
  });
}
