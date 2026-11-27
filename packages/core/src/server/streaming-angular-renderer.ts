import { ɵREQUESTS_CONTRIBUTE_TO_STABILITY } from '@angular/common/http';
import {
  type ApplicationConfig,
  type ApplicationRef,
  type Type,
  mergeApplicationConfig,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  INITIAL_CONFIG,
  PlatformState,
  platformServer,
  ɵSERVER_CONTEXT,
  ɵrenderInternal,
} from '@angular/platform-server';
import { SERVER_REQUEST_TRACKER } from '../client/server-request-tracker';
import { MANUAL_DEFER_BLOCKS, ServerDeferBlocks } from './defer-blocks';
import { HydrationStream } from './hydration-stream';
import { RequestTracker } from './request-tracker';
import { frameChunk, frameRuntime } from './stream-runtime';

export interface StreamingAngularRenderOptions {
  /** The application's root component. */
  rootComponent: Type<unknown>;
  /**
   * The application's server config: its browser config merged with
   * `provideServerRendering()` and whatever else the server needs.
   */
  config: ApplicationConfig;
  /** The `index.html` template to render into. */
  document: string;
  url: string;
}

export interface OpenBodyDocument {
  shell: string;
  tail: string;
}

/**
 * Renders the application as a streamed response the browser can start
 * hydrating before it has all of it.
 *
 *  1. Bootstrap, then wait until the structure is stable: the initial
 *     navigation has finished, lazy routes are loaded and `@defer` blocks
 *     have rendered (see `ServerDeferBlocks` for why that is done by hand).
 *     HTTP requests don't count towards this (see `SERVER_REQUEST_TRACKER`),
 *     so it doesn't wait for TMDB.
 *  2. Annotate that state for hydration and send it, with the client runtime
 *     and the application's entry scripts at the end. This shell is a
 *     complete, hydratable Angular document in its own right — rendered
 *     early, with loaders where the data will go. The browser starts loading
 *     and hydrating it now.
 *  3. Each time a request finishes and the application has rendered the
 *     result, annotate again and send every `@defer` block that changed,
 *     together with the transfer state the change came from.
 *  4. When nothing is in flight any more, say so and close.
 *
 * `@defer` blocks with a `hydrate` trigger are what make step 3 sound. Angular
 * does not touch their markup until the trigger fires, so it can be replaced
 * underneath an application that is already running. Anything that changes
 * outside such a block after the shell is simply rendered by the client, from
 * the same transfer state.
 *
 * Unlike `renderApplication`, nothing here waits for stability before the
 * first byte.
 */
export async function renderStreamingAngular({
  rootComponent,
  config,
  document,
  url,
}: StreamingAngularRenderOptions): Promise<Response> {
  const requestTracker = new RequestTracker();
  const platformRef = platformServer([
    { provide: INITIAL_CONFIG, useValue: { document, url } },
    { provide: ɵSERVER_CONTEXT, useValue: 'streamed-ssr' },
  ]);

  let destroyPromise: Promise<void> | undefined;
  let terminated = false;

  const destroyOnce = (): Promise<void> => {
    destroyPromise ??= destroyPlatform(platformRef);
    return destroyPromise;
  };

  try {
    const applicationRef = await bootstrapApplication(
      rootComponent,
      mergeApplicationConfig(config, {
        providers: [
          // HTTP leaves `whenStable()` to the tracker; see step 1 above.
          { provide: ɵREQUESTS_CONTRIBUTE_TO_STABILITY, useValue: false },
          { provide: SERVER_REQUEST_TRACKER, useValue: requestTracker },
          MANUAL_DEFER_BLOCKS,
        ],
      }),
      { platformRef },
    );
    const deferBlocks = new ServerDeferBlocks(applicationRef);
    await applicationRef.whenStable();
    await deferBlocks.render();

    const serverDocument = platformRef.injector.get(PlatformState).getDocument() as Document;
    const entryScripts = takeEntryScripts(serverDocument);
    const { shell, tail } = splitOpenBodyDocument(
      await ɵrenderInternal(platformRef, applicationRef),
    );
    warnIfEventReplayIsLost(serverDocument);
    const stream = new HydrationStream(applicationRef, serverDocument);
    const init = stream.begin(requestTracker.pending());
    const styles = new ComponentStyles(serverDocument, shell);

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

    // The runtime has to exist before the application does, and the
    // application's scripts go last so that everything they hydrate has
    // already been parsed.
    controller.enqueue(encoder.encode(`${shell}${frameRuntime(init)}${entryScripts}`));

    const terminateAfterCommit = (error: unknown): Promise<void> => {
      if (terminated) {
        return destroyPromise ?? Promise.resolve();
      }

      terminated = true;
      console.error('[ssr] streaming render failed after commit', error);
      try {
        // Headers are long gone, so the only honest signal left is a broken
        // stream. The browser keeps what it has, and the runtime releases the
        // application to fetch the rest itself once the document ends.
        controller.error(error);
      } catch {
        // The stream may already be in a terminal state.
      }
      return destroyOnce();
    };

    void (async () => {
      try {
        for (;;) {
          await requestTracker.nextCompletion();
          await whenRendered(applicationRef);
          await deferBlocks.render();
          if (terminated) {
            return;
          }

          const done = requestTracker.idle;
          const flush = stream.flush(requestTracker.pending(), done);
          // Taken after the flush: rendering the blocks it carries is what
          // adds the styles of components that are new to the page.
          const newStyles = styles.takeNew();
          if (flush !== null) {
            controller.enqueue(encoder.encode(frameChunk(flush.chunk, flush.markup, newStyles)));
          } else if (newStyles !== '') {
            controller.enqueue(encoder.encode(newStyles));
          }
          if (done) {
            break;
          }
        }

        controller.enqueue(encoder.encode(tail));
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
 * The stylesheets Angular adds to `<head>` for components: a `<style>` for
 * inline styles, or a `<link>` for external ones in dev. A component that
 * first renders inside a streamed block does so after the shell has gone out,
 * so each flush has to carry the stylesheets the shell did not, or the block
 * arrives unstyled and stays that way until the browser renders the component
 * itself.
 *
 * What was sent is read from the serialized shell, not from `<head>`: the
 * stylesheet of a component a `@defer` block depends on can already be in
 * `<head>` while the component has not rendered, and serialization leaves it
 * out.
 */
export class ComponentStyles {
  private readonly sent: Set<Element>;

  constructor(
    private readonly doc: Document,
    shell: string,
  ) {
    this.sent = new Set(this.current().filter((element) => shell.includes(element.outerHTML)));
  }

  /** Markup for every component stylesheet the client does not have yet. */
  takeNew(): string {
    let markup = '';
    for (const element of this.current()) {
      if (!this.sent.has(element)) {
        this.sent.add(element);
        markup += element.outerHTML;
      }
    }
    return markup;
  }

  private current(): Element[] {
    return Array.from(
      this.doc.head.querySelectorAll('style[ng-app-id], link[rel="stylesheet"][ng-app-id]'),
    );
  }
}

/**
 * Splits the serialized document at the closing `</body>`, so the first flush
 * can leave the body open for chunks to be appended into.
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

/**
 * Removes the application's module scripts from the document and returns them
 * as markup for the end of the shell, marked `async`.
 *
 * A module script is deferred by default: it does not run until the parser
 * has finished, and here the parser does not finish until the last chunk has
 * arrived. `async` makes it run as soon as it has loaded instead. Moving it
 * to the end of the shell is what guarantees `<app-root>` and transfer state
 * have been parsed by then — an async script in `<head>` could run first.
 */
export function takeEntryScripts(document: Document): string {
  let markup = '';
  for (const script of Array.from(document.querySelectorAll('script[type="module"]'))) {
    script.setAttribute('async', '');
    markup += script.outerHTML;
    script.remove();
  }

  return markup;
}

let warnedAboutEventReplay = false;

/**
 * `withEventReplay()` marks the page's listeners with `jsaction`, but only
 * queues early clicks if the template carried the event dispatch contract.
 * Angular says nothing when it didn't, so say it here, once.
 */
function warnIfEventReplayIsLost(document: Document): void {
  if (
    warnedAboutEventReplay ||
    document.getElementById('ng-event-dispatch-contract') !== null ||
    document.querySelector('[jsaction]') === null
  ) {
    return;
  }

  warnedAboutEventReplay = true;
  console.warn(
    '[ssr] withEventReplay() is on, but the template has no event dispatch contract, so ' +
      'clicks made before hydration are lost. Pass `eventDispatchContract` (the contents of ' +
      "'@angular/core/event-dispatch-contract.min.js') to the handler.",
  );
}

/**
 * Stable, a task later, and stable again. A response is handed to the
 * application in the same turn its request finishes, but what the application
 * does with it — a state update, another request — may take a hop or two to
 * show, and near-simultaneous responses are better sent as one flush.
 */
async function whenRendered(applicationRef: ApplicationRef): Promise<void> {
  await applicationRef.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await applicationRef.whenStable();
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
