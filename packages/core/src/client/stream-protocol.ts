/**
 * The wire contract between the streaming renderer on the server, the inline
 * runtime it puts in the shell, and the hydration client in the app bundle.
 *
 * Field names are short because every chunk carries them.
 */

/** A view as Angular's hydration annotation serializes it. */
export type SerializedView = Record<string, unknown>;

/** A `@defer` block as it appears under `__nghDeferData__`. */
export type SerializedDeferBlock = Record<string, unknown>;

/** Keys Angular itself uses inside a serialized view and in transfer state. */
export const NGH = {
  dataKey: '__nghData__',
  deferKey: '__nghDeferData__',
  containers: 'c',
  rootNodes: 'r',
  blockId: 'di',
  parentBlockId: 'p',
  hydrateTriggers: 't',
  /** `DeferBlockTrigger.Viewport`. */
  viewportTrigger: 2,
} as const;

/** One `@defer` block whose content the server rendered again. */
export interface StreamBlock {
  /** The block's id on the client: the `ngh=<id>` comment that anchors it. */
  id: string;
  /**
   * How many root nodes the server believes the client has in front of that
   * anchor. Only the runtime goes by it, before the application starts; after
   * that the application knows, and may have declined an earlier chunk.
   */
  o: number;
  /** The block's view, replacing what the client holds for it. */
  v: SerializedView;
  /**
   * Hydration data for the components inside the block. The markup refers to
   * these by position; the runtime rebases them onto the end of the client's
   * list.
   */
  n: SerializedView[];
  /** Defer info for this block and every block nested in it. */
  d: Record<string, SerializedDeferBlock>;
}

export interface StreamChunk {
  /** Blocks to replace. Each has a `<template data-ngs="id">` ahead of it. */
  b: StreamBlock[];
  /** Transfer state entries added since the previous chunk. */
  s: Record<string, unknown>;
  /** Requests still in flight on the server. */
  p: string[];
  /** Nothing follows: the server render is complete. */
  done?: boolean;
  /** Set by the runtime when the response ended without a `done` chunk. */
  aborted?: boolean;
}

/** What the shell hands the runtime to start from. */
export interface StreamInit {
  /** Length of `__nghData__` in the shell. */
  n: number;
  /** Requests in flight on the server when the shell was taken. */
  p: string[];
}

/** Where the runtime put a block's new content. */
export interface StreamSwap {
  /** First root node now in front of the anchor, if the block has any. */
  first: Node | null;
}

export interface StreamLogEntry {
  chunk: StreamChunk;
  /** Blocks whose markup was replaced, by id. */
  swapped: Record<string, StreamSwap>;
}

/** The app's side of the runtime, attached once Angular starts. */
export interface StreamSink {
  /**
   * How many root nodes a block currently has, or null when its markup must
   * be left alone because Angular has taken it over.
   */
  rootNodes(block: StreamBlock): number | null;
  apply(entry: StreamLogEntry): void;
}

/** `window.__ngs`, created by the inline runtime in the shell. */
export interface StreamRuntime extends StreamInit {
  done: boolean;
  /** Chunks that arrived before the app attached. */
  log: StreamLogEntry[];
  sink: StreamSink | null;
  push(chunk: StreamChunk): void;
}

/**
 * Identifies a request on both sides of the stream, so the client can tell a
 * request the server is already making from one only it makes.
 */
export function streamRequestKey(method: string, urlWithParams: string): string {
  return `${method} ${urlWithParams}`;
}
