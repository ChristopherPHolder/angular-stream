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
    const encodedDocument = (payload as HTMLTemplateElement).content
      .textContent;
    expect(Buffer.from(encodedDocument ?? '', 'base64').toString('utf8')).toBe(
      document
    );
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

  it('installs the decoded authoritative head and body without executing scripts', async () => {
    document.head.innerHTML = '<title>preview</title>';
    document.body.innerHTML =
      '<main data-preview>preview</main><section data-stream-boundary="delayed-content">ready preview</section>';
    const runtime = STREAM_BOUNDARY_PREVIEW_RUNTIME.slice(
      '<script>'.length,
      -'</script>'.length
    );
    Function(runtime)();
    const authoritativeDocument = `<!doctype html><html><head><title>authoritative</title><style data-late>main { color: green; }</style></head><body><app-root ng-server-context="streamed-ssr"><section data-stream-boundary="delayed-content">authoritative Gr\u00fc\u00dfe</section></app-root><script>window.__authoritativeScriptExecuted = true</script></body></html>`;

    document.body.insertAdjacentHTML(
      'beforeend',
      frameFinalDocument(authoritativeDocument)
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.title).toBe('authoritative');
    expect(document.head.querySelector('style[data-late]')).not.toBeNull();
    expect(document.querySelector('[data-preview]')).toBeNull();
    expect(document.body.textContent).toContain(
      'authoritative Gr\u00fc\u00dfe'
    );
    expect(document.querySelector('[ng-server-context]')).not.toBeNull();
    expect(document.querySelector('[data-stream-boundary]')).toBeNull();
    expect(document.querySelector('template')).toBeNull();
    expect(
      Array.from(document.querySelectorAll('*')).some((element) =>
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.COMMENT_NODE &&
            node.textContent?.startsWith('stream-')
        )
      )
    ).toBe(false);
    expect(
      (window as typeof window & { __authoritativeScriptExecuted?: boolean })
        .__authoritativeScriptExecuted
    ).toBeUndefined();
  });

  it('attempts final-document reconciliation only once', async () => {
    document.head.innerHTML = '<title>preview</title>';
    document.body.innerHTML = '<main>preview</main>';
    const runtime = STREAM_BOUNDARY_PREVIEW_RUNTIME.slice(
      '<script>'.length,
      -'</script>'.length
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    Function(runtime)();

    document.body.insertAdjacentHTML(
      'beforeend',
      '<template data-stream-final-document="base64">not base64</template><!--stream-final-document-commit-->'
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.insertAdjacentHTML(
      'beforeend',
      frameFinalDocument(
        '<!doctype html><html><head><title>second</title></head><body>second</body></html>'
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.title).toBe('preview');
    expect(document.body.textContent).toBe('preview');
    expect(document.querySelector('template')).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
