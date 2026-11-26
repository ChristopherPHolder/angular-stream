import type { StreamChunk, StreamInit } from '@angular-stream/streaming';

/** A block a chunk replaces. */
export interface FlushBlock {
  id: string;
  /** The `data-block` name of its content, if it has one. */
  name: string | null;
  /** Root nodes the server expected in front of the block's anchor. */
  replaces: number;
  markupBytes: number;
  excerpt: string;
}

export type Flush =
  | {
      kind: 'shell';
      /** Milliseconds from the request to the last byte of this flush. */
      at: number;
      bytes: number;
      anchors: string[];
      pending: string[];
      entryScripts: number;
      /** The shell's copy of the "outside any block" quote. */
      outsideQuote: string | null;
    }
  | {
      kind: 'chunk';
      at: number;
      bytes: number;
      blocks: FlushBlock[];
      stateEntries: number;
      stateBytes: number;
      pending: string[];
      done: boolean;
    }
  | { kind: 'tail'; at: number; bytes: number };

const CHUNK_START = '<script>__ngs.push(';
const CHUNK_END = ')</script>';
const TAIL = '</body>';
/** The start of the inline runtime, the last thing in the shell before the entry scripts. */
const RUNTIME_START = 'var S=window.__ngs=';
const ENTRY_SCRIPT = /<script[^>]*type="module"[^>]*><\/script>/y;

/**
 * Fetches a page and reports each flush of the streamed response as it
 * completes: the shell, every chunk, and the closing tags.
 *
 * Network packets do not line up with flushes, so this cuts the response at
 * the boundaries the renderer writes rather than at each read.
 */
export async function* readFlushes(url: string): AsyncGenerator<Flush> {
  const started = performance.now();
  const response = await fetch(url, { cache: 'no-store' });
  if (response.body === null) {
    throw new Error('The response has no body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let text = '';
  let cursor = 0;
  let shellSent = false;
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    finished = done;
    text += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const at = Math.round(performance.now() - started);
    const bytes = (part: string) => encoder.encode(part).length;

    if (!shellSent) {
      const end = shellEnd(text);
      if (end === -1 && !finished) {
        continue;
      }
      const shell = text.slice(0, end === -1 ? text.length : end);
      yield { kind: 'shell', at, bytes: bytes(shell), ...describeShell(shell) };
      shellSent = true;
      cursor = shell.length;
    }

    for (;;) {
      if (text.startsWith(TAIL, cursor)) {
        if (!finished) {
          break;
        }
        yield { kind: 'tail', at, bytes: bytes(text.slice(cursor)) };
        cursor = text.length;
        break;
      }

      const start = text.indexOf(CHUNK_START, cursor);
      const end = start === -1 ? -1 : text.indexOf(CHUNK_END, start);
      if (end === -1) {
        break;
      }

      const frame = text.slice(cursor, end + CHUNK_END.length);
      const chunk = JSON.parse(text.slice(start + CHUNK_START.length, end)) as StreamChunk;
      yield { kind: 'chunk', at, bytes: bytes(frame), ...describeChunk(frame, chunk) };
      cursor = end + CHUNK_END.length;
    }
  }
}

/**
 * Where the shell ends: after the inline runtime and the entry scripts that
 * follow it, which the server writes in the same flush. -1 until that much
 * has arrived.
 */
function shellEnd(text: string): number {
  const runtime = text.indexOf(RUNTIME_START);
  const runtimeEnd = runtime === -1 ? -1 : text.indexOf('</script>', runtime);
  if (runtimeEnd === -1) {
    return -1;
  }

  let end = runtimeEnd + '</script>'.length;
  ENTRY_SCRIPT.lastIndex = end;
  for (let match = ENTRY_SCRIPT.exec(text); match !== null; match = ENTRY_SCRIPT.exec(text)) {
    end = ENTRY_SCRIPT.lastIndex;
  }

  return end;
}

function describeShell(shell: string) {
  const init = /sink:null\},(\{.*?\})\);/s.exec(shell);
  const quote = /class="quote"[^>]*>([\s\S]*?)<\/p>/.exec(shell);
  return {
    anchors: [...shell.matchAll(/<!--ngh=(d\d+)-->/g)].map((match) => match[1]),
    pending: init ? (JSON.parse(init[1]) as StreamInit).p : [],
    entryScripts: (shell.match(/<script[^>]*type="module"[^>]*async/g) ?? []).length,
    outsideQuote: quote ? quote[1].replace(/<!--[\s\S]*?-->/g, '').trim() : null,
  };
}

function describeChunk(frame: string, chunk: StreamChunk) {
  const markup = new Map(
    [...frame.matchAll(/<template data-ngs="([^"]+)">([\s\S]*?)<\/template>/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );

  return {
    blocks: chunk.b.map((block): FlushBlock => {
      const html = markup.get(block.id) ?? '';
      return {
        id: block.id,
        name: /data-block="([^"]+)"/.exec(html)?.[1] ?? null,
        replaces: block.o,
        markupBytes: html.length,
        excerpt: excerpt(html),
      };
    }),
    stateEntries: Object.keys(chunk.s).length,
    stateBytes: JSON.stringify(chunk.s).length,
    pending: chunk.p,
    done: chunk.done === true,
  };
}

/** The start of some markup, without Angular's style-scoping attributes. */
function excerpt(html: string): string {
  const clean = html.replace(/ _ng(?:content|host)-[\w-]+=""/g, '').replace(/\s+/g, ' ');
  return clean.length > 220 ? `${clean.slice(0, 220)}…` : clean;
}
