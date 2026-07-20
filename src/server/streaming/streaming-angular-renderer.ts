import 'zone.js/node';
import { platformServer } from '@angular/platform-server';
import {
  INITIAL_CONFIG,
  PlatformState,
  ɵSERVER_CONTEXT,
} from '@angular/platform-server';
import bootstrap from '../../main.server';
import { STREAM_BOUNDARY_SINK } from '../../app/streaming/stream-boundary.directive';
import {
  frameStreamBoundary,
  STREAM_BOUNDARY_PREVIEW_RUNTIME,
} from './stream-boundary-protocol';
import { RequestStreamBoundarySink } from './stream-boundary-sink';

export interface StreamingAngularRenderOptions {
  document: string;
  url: string;
  requestId: string;
}

export interface OpenBodyDocument {
  shell: string;
  tail: string;
}

export async function renderStreamingAngular({
  document,
  url,
  requestId,
}: StreamingAngularRenderOptions): Promise<Response> {
  const boundarySink = new RequestStreamBoundarySink();
  const platformRef = platformServer([
    { provide: INITIAL_CONFIG, useValue: { document, url } },
    { provide: ɵSERVER_CONTEXT, useValue: 'streamed-ssr' },
    { provide: STREAM_BOUNDARY_SINK, useValue: boundarySink },
  ]);
  let destroyPromise: Promise<void> | undefined;
  let terminated = false;

  const destroyOnce = (): Promise<void> => {
    destroyPromise ??= destroyPlatform(platformRef).then(() => {
      console.log(`[ssr:${requestId}] destroyed`);
    });
    return destroyPromise;
  };

  try {
    console.log(`[ssr:${requestId}] bootstrap`);
    const applicationRef = await bootstrap({ platformRef });
    const platformState = platformRef.injector.get(PlatformState);
    const liveDocument = platformState.getDocument();
    const previewDocument = renderWithoutModuleScripts(liveDocument, () =>
      platformState.renderToString()
    );
    const { shell, tail } = splitOpenBodyDocument(previewDocument);
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;

    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
      cancel() {
        if (terminated) {
          return destroyPromise;
        }

        terminated = true;
        console.log(`[ssr:${requestId}] cancelled`);
        return destroyOnce();
      },
    });
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

    controller.enqueue(
      encoder.encode(`${shell}${STREAM_BOUNDARY_PREVIEW_RUNTIME}`)
    );
    console.log(`[ssr:${requestId}] shell`);

    const terminateAfterCommit = (error: unknown): Promise<void> => {
      if (terminated) {
        return destroyPromise ?? Promise.resolve();
      }

      terminated = true;
      console.error(`[ssr:${requestId}] failed`, error);
      try {
        controller.error(error);
      } catch {
        // The response stream may already have reached a terminal state.
      }
      return destroyOnce();
    };

    boundarySink.subscribe((payload) => {
      if (terminated) {
        return;
      }

      try {
        const frame = frameStreamBoundary(payload);
        controller.enqueue(encoder.encode(frame));
        console.log(`[ssr:${requestId}] boundary ${payload.id}`);
      } catch (error) {
        void terminateAfterCommit(error);
      }
    });

    void (async () => {
      try {
        await applicationRef.whenStable();
        if (terminated) {
          return;
        }

        boundarySink.assertComplete();
        console.log(`[ssr:${requestId}] stable`);
        controller.enqueue(encoder.encode(tail));
        controller.close();
        terminated = true;
        console.log(`[ssr:${requestId}] closed`);
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
    terminated = true;
    await destroyOnce();
    throw error;
  }
}

export function splitOpenBodyDocument(document: string): OpenBodyDocument {
  const terminalBodyIndex = document.toLowerCase().lastIndexOf('</body>');

  if (terminalBodyIndex === -1) {
    throw new Error(
      'Rendered document is missing a terminal </body></html> tail'
    );
  }

  const tail = document.slice(terminalBodyIndex);
  if (!/^<\/body>\s*<\/html>\s*$/i.test(tail)) {
    throw new Error(
      'Rendered document has a malformed terminal </body></html> tail'
    );
  }

  return {
    shell: document.slice(0, terminalBodyIndex),
    tail,
  };
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

export function renderWithoutModuleScripts(
  document: ServerDocument,
  render: () => string
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
    for (const script of Array.from(
      document.querySelectorAll('script[type="module"]')
    )) {
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

function destroyPlatform(
  platformRef: ReturnType<typeof platformServer>
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      platformRef.destroy();
      resolve();
    }, 0);
  });
}
