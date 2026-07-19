import 'zone.js/node';
import {
  INITIAL_CONFIG,
  platformServer,
  ɵrenderInternal,
  ɵSERVER_CONTEXT,
} from '@angular/platform-server';
import bootstrap from '../../main.server';

export interface BufferedAngularRenderOptions {
  document: string;
  url: string;
  requestId: string;
}

export async function renderBufferedAngular({
  document,
  url,
  requestId,
}: BufferedAngularRenderOptions): Promise<Response> {
  const platformRef = platformServer([
    { provide: INITIAL_CONFIG, useValue: { document, url } },
    { provide: ɵSERVER_CONTEXT, useValue: 'streamed-ssr' },
  ]);

  try {
    console.log(`[ssr:${requestId}] bootstrap`);
    const applicationRef = await bootstrap({ platformRef });

    await applicationRef.whenStable();
    console.log(`[ssr:${requestId}] stable`);

    const renderedDocument = await ɵrenderInternal(platformRef, applicationRef);
    console.log(`[ssr:${requestId}] serialized`);

    return new Response(renderedDocument, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await destroyPlatform(platformRef);
    console.log(`[ssr:${requestId}] destroyed`);
  }
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
