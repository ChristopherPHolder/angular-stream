import {
  type ApplicationRef,
  type Provider,
  ɵCONTAINER_HEADER_OFFSET,
  ɵDEFER_BLOCK_CONFIG,
  ɵDeferBlockBehavior,
  ɵDeferBlockState,
  ɵgetDeferBlocks,
  ɵrenderDeferBlockState,
  ɵtriggerResourceLoading,
} from '@angular/core';

type LView = unknown[];

/** A `@defer` block as Angular's own helper reports it. */
export interface DeferBlockDetails {
  lContainer: unknown[];
  lView: LView;
  tNode: unknown;
  tDetails: { hydrateTriggers: Map<number, unknown> | null };
}

/**
 * Stops `@defer` blocks from rendering on their own, so `ServerDeferBlocks`
 * can do it.
 */
export const MANUAL_DEFER_BLOCKS: Provider = {
  provide: ɵDEFER_BLOCK_CONFIG,
  useValue: { behavior: ɵDeferBlockBehavior.Manual },
};

/**
 * Renders `@defer` blocks with a `hydrate` trigger on the server.
 *
 * Angular does this itself: on the server every hydrate trigger fires the
 * moment its instruction runs. For `hydrate when` that moment is a template
 * update, and once a block's dependencies are loaded — from the second
 * request an isolate serves — the block's view is inserted right there,
 * synchronously. Inserting a view marks the signal queries that could match
 * it as dirty, and writing to a signal while a template renders is NG0600. The
 * insertion is abandoned half way and the render is left corrupt.
 *
 * `hydrate when` is the trigger streamed hydration wants most, so the blocks
 * are rendered from here instead, between change detection passes, the way
 * `DeferBlockFixture` renders them in tests. Requires `MANUAL_DEFER_BLOCKS`.
 */
export class ServerDeferBlocks {
  private readonly rendered = new WeakSet<object>();

  constructor(private readonly appRef: ApplicationRef) {}

  /**
   * Renders every block that has appeared since the last call, including the
   * ones that rendering uncovers, and resolves once the application is stable
   * again.
   */
  async render(): Promise<void> {
    for (;;) {
      const blocks = this.find().filter(
        (block) =>
          (block.tDetails.hydrateTriggers?.size ?? 0) > 0 && !this.rendered.has(block.lContainer),
      );
      if (blocks.length === 0) {
        return;
      }

      for (const block of blocks) {
        this.rendered.add(block.lContainer);
        await (ɵtriggerResourceLoading as (...args: unknown[]) => Promise<unknown>)(
          block.tDetails,
          block.lView,
          block.tNode,
        );
        (ɵrenderDeferBlockState as (...args: unknown[]) => void)(
          ɵDeferBlockState.Complete,
          block.tNode,
          block.lContainer,
        );
      }

      // Rendering a block marks its view for refresh without scheduling one.
      this.appRef.tick();
      await this.appRef.whenStable();
    }
  }

  private find(): DeferBlockDetails[] {
    const blocks: DeferBlockDetails[] = [];
    const viewRefs = (this.appRef as unknown as { _views: Array<{ _lView?: LView }> })._views;
    for (const viewRef of viewRefs) {
      if (Array.isArray(viewRef._lView)) {
        collectDeferBlocks(viewRef._lView, blocks);
      }
    }

    return blocks;
  }
}

/**
 * Every `@defer` block under a view, outermost first. Angular's helper stops
 * at each block it finds, so the views inside are searched separately.
 */
export function collectDeferBlocks(lView: LView, out: DeferBlockDetails[]): void {
  const found: DeferBlockDetails[] = [];
  (ɵgetDeferBlocks as (lView: LView, blocks: unknown[]) => void)(lView, found);

  for (const block of found) {
    out.push(block);
    for (let i = ɵCONTAINER_HEADER_OFFSET; i < block.lContainer.length; i++) {
      collectDeferBlocks(block.lContainer[i] as LView, out);
    }
  }
}
