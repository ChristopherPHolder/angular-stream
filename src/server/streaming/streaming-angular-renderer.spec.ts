import { describe, expect, it } from 'vitest';
import {
  renderWithoutModuleScripts,
  splitOpenBodyDocument,
} from './streaming-angular-renderer';

describe('renderWithoutModuleScripts', () => {
  it('restores adjacent module scripts in their original positions', () => {
    const document = new DOMParser().parseFromString(
      '<body><script id="first" type="module"></script><script id="second" type="module"></script><script id="classic"></script></body>',
      'text/html'
    );

    const preview = renderWithoutModuleScripts(document, () => {
      return document.documentElement.outerHTML;
    });

    expect(preview).not.toContain('type="module"');
    expect(Array.from(document.scripts, (script) => script.id)).toStrictEqual([
      'first',
      'second',
      'classic',
    ]);
  });

  it('restores module scripts when serialization fails', () => {
    const document = new DOMParser().parseFromString(
      '<body><script id="module" type="module"></script></body>',
      'text/html'
    );

    expect(() =>
      renderWithoutModuleScripts(document, () => {
        throw new Error('serialization failed');
      })
    ).toThrow('serialization failed');
    expect(document.querySelector('#module')).not.toBeNull();
  });
});

describe('splitOpenBodyDocument', () => {
  it('keeps the exact terminal body and html suffix', () => {
    expect(
      splitOpenBodyDocument('<html><body><main>shell</main></body> \n</html>\n')
    ).toEqual({
      shell: '<html><body><main>shell</main>',
      tail: '</body> \n</html>\n',
    });
  });

  it.each([
    '<html><main>shell</main></html>',
    '<html><body>shell</body>',
    '<html><body>shell</body></html><footer>trailing</footer>',
    '<html><body>shell</body><footer>trailing</footer></html>',
  ])('rejects a malformed document tail: %s', (document) => {
    expect(() => splitOpenBodyDocument(document)).toThrow(
      /terminal <\/body><\/html> tail/
    );
  });
});
