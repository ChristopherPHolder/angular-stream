import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  frameFinalDocument,
  frameStreamBoundary,
  STREAM_BOUNDARY_PREVIEW_RUNTIME,
} from './stream-boundary-protocol';

describe('stream boundary protocol', () => {
  it('frames the complete host and adjacent commit marker', () => {
    expect(
      frameStreamBoundary({
        id: 'delayed-content',
        html: '<section data-stream-boundary="delayed-content">ready</section>',
      })
    ).toBe(
      '<template data-stream-boundary-payload="delayed-content"><section data-stream-boundary="delayed-content">ready</section></template><!--stream-boundary-commit:delayed-content-->'
    );
  });

  it('frames the final document as an inert, safely encoded payload', () => {
    const document =
      '<!doctype html><html><body>Gr\u00fc\u00dfe</template><!-- unsafe --><script>throw new Error()</script></body></html>';
    const frame = frameFinalDocument(document);
    const parsedFrame = new DOMParser().parseFromString(
      `<body>${frame}</body>`,
      'text/html'
    );
    const payload = parsedFrame.querySelector(
      'template[data-stream-final-document="base64"]'
    );

    expect(payload).toBeInstanceOf(HTMLTemplateElement);
    const encodedDocument = (payload as HTMLTemplateElement).content.textContent;
    expect(
      Buffer.from(encodedDocument ?? '', 'base64').toString('utf8')
    ).toBe(document);
    expect(frame).not.toContain(document);
    expect(frame.endsWith('<!--stream-final-document-commit-->')).toBe(true);
  });

  it('replaces a matching live host and removes its transport artifacts', async () => {
    document.body.innerHTML =
      '<section data-stream-boundary="delayed-content">waiting</section>';
    const runtime = STREAM_BOUNDARY_PREVIEW_RUNTIME.slice(
      '<script>'.length,
      -'</script>'.length
    );
    Function(runtime)();

    document.body.insertAdjacentHTML(
      'beforeend',
      frameStreamBoundary({
        id: 'delayed-content',
        html: '<section data-stream-boundary="delayed-content">ready</section>',
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('[data-stream-boundary]')?.textContent).toBe(
      'ready'
    );
    expect(document.querySelector('template')).toBeNull();
    expect(
      Array.from(document.body.childNodes).some(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent?.startsWith('stream-boundary-commit:')
      )
    ).toBe(false);

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    document.body.insertAdjacentHTML(
      'beforeend',
      frameStreamBoundary({
        id: 'delayed-content',
        html: '<section data-stream-boundary="wrong-id">invalid</section>',
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('template')).toBeNull();
    expect(document.body.textContent).not.toContain('invalid');
    expect(consoleError).toHaveBeenCalledWith(
      '[stream-boundary] Invalid payload for "delayed-content"'
    );
    consoleError.mockRestore();
  });
});
