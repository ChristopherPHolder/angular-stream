import { Component, afterNextRender, signal } from '@angular/core';
import { type Flush, readFlushes } from './read-flushes';

const SPEEDS = [
  { scale: 1, label: 'Normal speed' },
  { scale: 3, label: 'Slow motion (×3)' },
  { scale: 0.05, label: 'Fast' },
  { scale: 0, label: 'No delay' },
] as const;

@Component({
  selector: 'demo-inspector',
  templateUrl: './inspector.html',
  styleUrl: './inspector.css',
})
export class Inspector {
  protected readonly speeds = SPEEDS;
  protected readonly scale = signal<number>(1);
  protected readonly flushes = signal<Flush[]>([]);
  protected readonly running = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    afterNextRender(() => void this.run());
  }

  protected async run(scale = this.scale()): Promise<void> {
    this.scale.set(scale);
    this.flushes.set([]);
    this.error.set(null);
    this.running.set(true);
    try {
      for await (const flush of readFlushes(`/?scale=${scale}`, entryScriptCount())) {
        this.flushes.update((flushes) => [...flushes, flush]);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.running.set(false);
    }
  }

  protected kb(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  protected path(request: string): string {
    return request.replace(/^GET https?:\/\/[^/]+/, 'GET ');
  }
}

/**
 * How many entry scripts end a shell. The page being inspected comes from the
 * same template as this one, so it ends with the same scripts: the server
 * moved them out of `<head>` and marked them `async`. Falls back to one when
 * this page itself was not streamed.
 */
function entryScriptCount(): number {
  return Math.max(1, document.querySelectorAll('script[type="module"][async]').length);
}
