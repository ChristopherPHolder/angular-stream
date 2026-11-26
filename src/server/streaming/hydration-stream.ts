import {
  APP_ID,
  type ApplicationRef,
  TransferState,
  makeStateKey,
  ɵCONTAINER_HEADER_OFFSET,
  ɵannotateForHydration,
  ɵgetDeferBlocks,
} from '@angular/core';
import {
  NGH,
  type SerializedDeferBlock,
  type SerializedView,
  type StreamBlock,
  type StreamChunk,
  type StreamInit,
} from '../../app/streaming/stream-protocol';

const NGH_DATA_KEY = makeStateKey<SerializedView[]>(NGH.dataKey);
const NGH_DEFER_KEY = makeStateKey<Record<string, SerializedDeferBlock>>(NGH.deferKey);

// Positions in Angular's internal view arrays, and the node and view type
// flags read from them. They are private to Angular, which is one more reason
// the version is pinned.
const LVIEW_TVIEW = 1;
const LCONTAINER_NATIVE = 7;
const TNODE_ELEMENT_CONTAINER = 8;
const TVIEW_EMBEDDED = 2;

const ANCHOR_PREFIX = 'ngh=';
const BLOCK_ATTRIBUTE = 'ngb';
const HYDRATION_ATTRIBUTE = 'ngh';
const TEXT_MARKERS = new Set(['ngetn', 'ngtns']);

type LView = unknown[];

/** Templates already reported as not streamable, so each is reported once. */
const reported = new WeakSet<object>();

interface TNode {
  type: number;
  parent: TNode | null;
  componentOffset: number;
}

/** A `@defer` block the last annotation pass gave an id to. */
interface DeferBlock {
  lContainer: unknown[];
  tNode: TNode;
  anchor: Comment;
  /** The id from the latest pass. Passes number blocks from zero each time. */
  passId: string;
  streamable: boolean;
  children: DeferBlock[];
}

/** What the server remembers about a block between passes. */
interface BlockRecord {
  /** The id the client knows the block by. Never changes. */
  clientId: string;
  /** Whether the client has markup for the block at all. */
  onClient: boolean;
  /** Root nodes the client has in front of the block's anchor. */
  rootNodes: number;
  /** What the client was last sent, to tell whether the block changed. */
  signature: string;
}

interface Pass {
  views: SerializedView[];
  viewsById: Map<string, SerializedView>;
  deferData: Record<string, SerializedDeferBlock>;
  roots: DeferBlock[];
  /** This pass's ids, mapped to the ids the client knows. */
  clientIds: Map<string, string>;
}

interface Extraction {
  block: StreamBlock;
  markup: string;
  signature: string;
}

export interface StreamFlush {
  chunk: StreamChunk;
  /** Markup for each block in the chunk, by client id. */
  markup: Map<string, string>;
}

/**
 * Turns a running server application into a shell and a series of chunks.
 *
 * Angular annotates a document for hydration in one pass over the whole
 * application: it stamps `ngh` indices on component hosts, numbers `@defer`
 * blocks, and writes one flat list of serialized views into transfer state.
 * None of that is incremental. So every flush runs the full pass again and
 * then cuts out just the blocks that changed, translating the two things a
 * fresh pass renumbers:
 *
 *  - `ngh` indices. The client already holds the shell's list and cannot
 *    renumber it, so a block ships its own entries and refers to them by
 *    position; the runtime rebases them onto the end of the client's list.
 *  - block ids. A pass counts blocks from `d0` in the order it meets them,
 *    which shifts as content appears. Each block keeps the id it had when the
 *    client first saw it.
 *
 * Only a block whose node count nothing else depends on can be replaced like
 * this — see `hasIndependentFootprint`. Blocks nest: one that changes inside
 * an unchanged block is sent on its own, so the client can take it even after
 * it has hydrated the block around it.
 */
export class HydrationStream {
  private readonly transferState: TransferState;
  private readonly records = new WeakMap<object, BlockRecord>();
  private readonly sentState = new Set<string>();
  private nextBlockNumber = 0;
  private lastPending = '';

  constructor(
    private readonly appRef: ApplicationRef,
    private readonly doc: Document,
  ) {
    this.transferState = appRef.injector.get(TransferState);
  }

  /**
   * Records what the client is about to receive in the shell. Call it right
   * after the shell has been annotated and serialized.
   */
  begin(pending: string[]): StreamInit {
    const pass = this.read((block) => {
      this.nextBlockNumber++;
      return { clientId: block.passId, onClient: true, rootNodes: 0, signature: '' };
    });

    for (const root of pass.roots) {
      if (!root.streamable && !reported.has(root.tNode)) {
        reported.add(root.tNode);
        console.warn(
          `[ssr] @defer block ${root.passId} cannot be streamed: it sits directly inside an ` +
            'embedded view, an <ng-container> or projected content, so its node count is ' +
            "part of its parent's hydration data. Wrap it in an element.",
        );
      }
    }
    for (const root of pass.roots.flatMap(replaceable)) {
      this.remember(root, pass);
    }

    for (const key of Object.keys(this.readState())) {
      this.sentState.add(key);
    }
    this.lastPending = pending.join('\n');

    // The serialized shell has these; the live document must not keep them,
    // or the next pass would add a second set.
    this.doc.getElementById(`${this.appRef.injector.get(APP_ID)}-state`)?.remove();
    this.removeTextMarkers();

    return { n: pass.views.length, p: pending };
  }

  /** Renders whatever changed since the last flush, or null if nothing did. */
  flush(pending: string[], done: boolean): StreamFlush | null {
    ɵannotateForHydration(this.appRef, this.doc);
    const pass = this.read((block) => ({
      clientId: `d${this.nextBlockNumber++}`,
      // Created after the shell: the client only gets it as part of a block
      // that contains it.
      onClient: false,
      rootNodes: 0,
      signature: '',
    }));

    const blocks: StreamBlock[] = [];
    const markup = new Map<string, string>();
    const visit = (block: DeferBlock) => {
      const record = this.records.get(block.lContainer)!;
      if (!record.onClient) {
        return;
      }

      const extraction = this.extract(block, pass);
      if (extraction.signature === record.signature) {
        // Unchanged itself; something nested in it may not be.
        block.children.flatMap(replaceable).forEach(visit);
        return;
      }

      extraction.block.o = record.rootNodes;
      blocks.push(extraction.block);
      markup.set(extraction.block.id, extraction.markup);
      this.remember(block, pass, extraction);
    };
    pass.roots.flatMap(replaceable).forEach(visit);
    this.removeTextMarkers();

    const state: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.readState())) {
      if (!this.sentState.has(key)) {
        this.sentState.add(key);
        state[key] = value;
      }
    }

    const pendingKey = pending.join('\n');
    const pendingChanged = pendingKey !== this.lastPending;
    this.lastPending = pendingKey;

    if (blocks.length === 0 && Object.keys(state).length === 0 && !pendingChanged && !done) {
      return null;
    }

    const chunk: StreamChunk = { b: blocks, s: state, p: pending };
    if (done) {
      chunk.done = true;
    }

    return { chunk, markup };
  }

  /** Reads the result of the annotation pass that has just run. */
  private read(createRecord: (block: DeferBlock) => BlockRecord): Pass {
    const views = this.transferState.get(NGH_DATA_KEY, []);
    const viewsById = new Map<string, SerializedView>();
    for (const view of views) {
      indexViews(view, viewsById);
    }

    const roots: DeferBlock[] = [];
    const viewRefs = (this.appRef as unknown as { _views: Array<{ _lView?: LView }> })._views;
    for (const viewRef of viewRefs) {
      if (Array.isArray(viewRef._lView)) {
        collectBlocks(viewRef._lView, viewsById, roots);
      }
    }

    const clientIds = new Map<string, string>();
    const assign = (block: DeferBlock) => {
      let record = this.records.get(block.lContainer);
      if (record === undefined) {
        record = createRecord(block);
        this.records.set(block.lContainer, record);
      }
      clientIds.set(block.passId, record.clientId);
      block.children.forEach(assign);
    };
    roots.forEach(assign);

    return {
      views,
      viewsById,
      deferData: this.transferState.get(NGH_DEFER_KEY, {}),
      roots,
      clientIds,
    };
  }

  /** Cuts one block out of the freshly annotated document. */
  private extract(root: DeferBlock, pass: Pass): Extraction {
    const view = pass.viewsById.get(root.passId)!;
    const translate = <T>(value: T): T =>
      JSON.parse(JSON.stringify(value), (key, entry) =>
        key === NGH.blockId && typeof entry === 'string'
          ? (pass.clientIds.get(entry) ?? entry)
          : entry,
      );

    // Rewritten on a copy. The live nodes belong to the running application.
    const holder = this.doc.createElement('div');
    for (const node of rootNodesBefore(root.anchor, rootNodesOf(view))) {
      holder.appendChild(node.cloneNode(true));
    }

    const positions = new Map<string, number>();
    const entries: SerializedView[] = [];
    const localIndex = (passIndex: string): string => {
      let position = positions.get(passIndex);
      if (position === undefined) {
        position = entries.length;
        positions.set(passIndex, position);
        entries.push(translate(pass.views[Number(passIndex)]));
      }
      return String(position);
    };

    walk(holder, (node) => {
      if (isComment(node)) {
        if (node.data.startsWith(ANCHOR_PREFIX)) {
          const passId = node.data.slice(ANCHOR_PREFIX.length);
          node.data = ANCHOR_PREFIX + (pass.clientIds.get(passId) ?? passId);
        }
        return;
      }
      if (!isElement(node)) {
        return;
      }

      const hydration = node.getAttribute(HYDRATION_ATTRIBUTE);
      if (hydration !== null) {
        // `a|b` when the host is also a view container.
        const local = hydration.split('|').map((part) => (part === '' ? part : localIndex(part)));
        node.setAttribute(HYDRATION_ATTRIBUTE, local.join('|'));
      }
      const blockId = node.getAttribute(BLOCK_ATTRIBUTE);
      if (blockId !== null) {
        node.setAttribute(BLOCK_ATTRIBUTE, pass.clientIds.get(blockId) ?? blockId);
      }
    });

    const defer: Record<string, SerializedDeferBlock> = {};
    const describe = (block: DeferBlock) => {
      const info = { ...pass.deferData[block.passId] };
      const parent = info[NGH.parentBlockId];
      if (typeof parent === 'string') {
        info[NGH.parentBlockId] = pass.clientIds.get(parent) ?? parent;
      }
      defer[pass.clientIds.get(block.passId)!] = info;
      block.children.forEach(describe);
    };
    describe(root);

    const markup = holder.innerHTML;
    const block: StreamBlock = {
      id: pass.clientIds.get(root.passId)!,
      o: 0,
      v: translate(view),
      n: entries,
      d: defer,
    };

    return { block, markup, signature: this.sign(root, pass, holder, block) };
  }

  /**
   * What identifies a block's own content: its markup and data with every
   * block nested in it cut out. A nested block that changes is sent by itself,
   * and must not make the blocks around it look changed too.
   */
  private sign(root: DeferBlock, pass: Pass, holder: Element, block: StreamBlock): string {
    const nested = new Map<string, DeferBlock>();
    for (const child of root.children.flatMap(replaceable)) {
      nested.set(pass.clientIds.get(child.passId)!, child);
    }
    const withoutNested = (_key: string, value: unknown): unknown => {
      const blockId = (value as SerializedView | null)?.[NGH.blockId];
      return typeof blockId === 'string' && nested.has(blockId)
        ? { [NGH.blockId]: blockId }
        : value;
    };

    const own = holder.cloneNode(true) as Element;
    const anchors: Array<[Comment, DeferBlock]> = [];
    walk(own, (node) => {
      if (isComment(node) && node.data.startsWith(ANCHOR_PREFIX)) {
        const child = nested.get(node.data.slice(ANCHOR_PREFIX.length));
        if (child !== undefined) {
          anchors.push([node, child]);
        }
      } else if (isElement(node)) {
        // Positions depend on what precedes the host, nested blocks included.
        // The data they stand for does not.
        const hydration = node.getAttribute(HYDRATION_ATTRIBUTE);
        if (hydration !== null) {
          const data = hydration.split('|').map((part) => (part === '' ? null : block.n[+part]));
          node.setAttribute(HYDRATION_ATTRIBUTE, JSON.stringify(data, withoutNested));
        }
      }
    });
    for (const [anchor, child] of anchors) {
      const count = rootNodesOf(pass.viewsById.get(child.passId)!);
      for (const node of rootNodesBefore(anchor, count)) {
        node.parentNode?.removeChild(node);
      }
    }

    return `${own.innerHTML}\n${JSON.stringify([block.v, block.d[block.id]], withoutNested)}`;
  }

  /**
   * Records that the client has `block` as it is now, along with everything
   * nested in it.
   */
  private remember(block: DeferBlock, pass: Pass, extraction?: Extraction): void {
    const { block: sent, signature } = extraction ?? this.extract(block, pass);
    const record = this.records.get(block.lContainer)!;
    record.rootNodes = rootNodesOf(sent.v);
    record.signature = signature;

    const markOnClient = (child: DeferBlock) => {
      this.records.get(child.lContainer)!.onClient = true;
      child.children.forEach(markOnClient);
    };
    markOnClient(block);

    for (const child of block.children.flatMap(replaceable)) {
      this.remember(child, pass);
    }
  }

  /** Transfer state without the hydration data, which is sent per block. */
  private readState(): Record<string, unknown> {
    const state: Record<string, unknown> = JSON.parse(this.transferState.toJson());
    delete state[NGH.dataKey];
    delete state[NGH.deferKey];
    return state;
  }

  /**
   * Annotation leaves marker comments beside text nodes that HTML parsing
   * would otherwise lose or merge. They belong in what gets serialized, not in
   * the document the application keeps rendering into.
   */
  private removeTextMarkers(): void {
    const markers: Comment[] = [];
    walk(this.doc.body, (node) => {
      if (isComment(node) && TEXT_MARKERS.has(node.data)) {
        markers.push(node);
      }
    });
    for (const marker of markers) {
      marker.remove();
    }
  }
}

/**
 * Whether a block's root nodes can change in number without invalidating
 * hydration data outside the block.
 *
 * Angular finds nodes by counting. A view records how many root nodes it has,
 * and an `<ng-container>` how many nodes it wraps; both counts include a
 * `@defer` block that sits directly inside. The client already has those
 * counts from the shell, so replacing such a block with a different number of
 * nodes would leave its parent pointing at the wrong ones. A block directly
 * inside an element has no such dependents: the element is one node whatever
 * it contains. Projected blocks are left out as well, because the nodes that
 * follow projected content are addressed by sibling position.
 */
function hasIndependentFootprint(hostLView: LView, tNode: TNode): boolean {
  const parent = tNode.parent;
  if (parent === null) {
    return (hostLView[LVIEW_TVIEW] as { type: number }).type !== TVIEW_EMBEDDED;
  }

  return (parent.type & TNODE_ELEMENT_CONTAINER) === 0 && parent.componentOffset === -1;
}

/**
 * Finds the annotated `@defer` blocks under a view, as a tree. Angular's
 * helper stops at each block it finds, so its views are searched separately.
 * A block without an id — no `hydrate` trigger — is not a boundary, and the
 * blocks inside it are reported in its place.
 */
function collectBlocks(
  lView: LView,
  viewsById: ReadonlyMap<string, SerializedView>,
  out: DeferBlock[],
): void {
  const found: Array<{ lContainer: unknown[]; lView: LView; tNode: TNode }> = [];
  (ɵgetDeferBlocks as (lView: LView, blocks: unknown[]) => void)(lView, found);

  for (const { lContainer, lView: hostLView, tNode } of found) {
    const children: DeferBlock[] = [];
    for (let i = ɵCONTAINER_HEADER_OFFSET; i < lContainer.length; i++) {
      collectBlocks(lContainer[i] as LView, viewsById, children);
    }

    const anchor = lContainer[LCONTAINER_NATIVE] as Node | null;
    const passId =
      anchor != null && isComment(anchor) && anchor.data.startsWith(ANCHOR_PREFIX)
        ? anchor.data.slice(ANCHOR_PREFIX.length)
        : null;

    if (passId === null || !viewsById.has(passId)) {
      out.push(...children);
    } else {
      out.push({
        lContainer,
        tNode,
        anchor: anchor as Comment,
        passId,
        streamable: hasIndependentFootprint(hostLView, tNode),
        children,
      });
    }
  }
}

/**
 * The outermost blocks that can be replaced on their own. A block that cannot
 * be gives way to the blocks inside it.
 */
function replaceable(block: DeferBlock): DeferBlock[] {
  return block.streamable ? [block] : block.children.flatMap(replaceable);
}

function indexViews(view: SerializedView, viewsById: Map<string, SerializedView>): void {
  const blockId = view[NGH.blockId];
  if (typeof blockId === 'string') {
    viewsById.set(blockId, view);
  }

  const containers = view[NGH.containers];
  if (containers === null || typeof containers !== 'object') {
    return;
  }
  for (const views of Object.values(containers)) {
    if (Array.isArray(views)) {
      for (const child of views) {
        indexViews(child, viewsById);
      }
    }
  }
}

function rootNodesOf(view: SerializedView): number {
  const count = view[NGH.rootNodes];
  return typeof count === 'number' ? count : 0;
}

/**
 * The `count` root nodes in front of a block's anchor, in document order.
 * Text markers sit after the node they describe and are not root nodes
 * themselves, so they are collected without being counted.
 */
function rootNodesBefore(anchor: Node, count: number): Node[] {
  const nodes: Node[] = [];
  let node = anchor.previousSibling;
  while (count > 0 && node !== null) {
    if (!(isComment(node) && TEXT_MARKERS.has(node.data))) {
      count--;
    }
    nodes.unshift(node);
    node = node.previousSibling;
  }

  if (count > 0) {
    throw new Error('A @defer block has fewer root nodes than its hydration data says');
  }

  return nodes;
}

function walk(node: Node, visit: (node: Node) => void): void {
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    visit(child);
    walk(child, visit);
  }
}

function isComment(node: Node): node is Comment {
  return node.nodeType === 8;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}
