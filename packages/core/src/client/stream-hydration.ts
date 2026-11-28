import { HttpInterceptorFn, ɵREQUESTS_CONTRIBUTE_TO_STABILITY } from '@angular/common/http';
import {
  EnvironmentProviders,
  InjectionToken,
  NgZone,
  Provider,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
  provideEnvironmentInitializer,
  ɵDEFER_BLOCK_CONFIG,
  ɵDEHYDRATED_BLOCK_REGISTRY,
  ɵDeferBlockBehavior,
  ɵwithIncrementalHydration,
} from '@angular/core';
import { Observable, finalize, switchMap } from 'rxjs';
import { SERVER_REQUEST_TRACKER } from './server-request-tracker';
import {
  NGH,
  SerializedDeferBlock,
  SerializedView,
  StreamBlock,
  StreamLogEntry,
  StreamRuntime,
  StreamSink,
  streamRequestKey,
} from './stream-protocol';

const NGH_DATA_KEY = makeStateKey<SerializedView[]>(NGH.dataKey);
const NGH_DEFER_KEY = makeStateKey<Record<string, SerializedDeferBlock>>(NGH.deferKey);

/** `DEHYDRATED_VIEWS` in Angular's `LContainer` layout. */
const DEHYDRATED_VIEWS = 6;

/** What Angular's registry keeps for a block that is still server markup. */
interface DehydratedBlock {
  lContainer: unknown[];
}

interface DehydratedContainerView {
  data: SerializedView;
  firstChild: Node | null;
}

/** The methods of Angular's `DehydratedBlockRegistry` this gates. */
interface BlockRegistry {
  add(blockId: string, info: DehydratedBlock): void;
  get(blockId: string): DehydratedBlock | null;
  cleanup(blockIds: string[]): void;
  hydrating: Map<string, unknown>;
}

/**
 * The app's half of streamed hydration.
 *
 * The server sends the shell as soon as the route's structure exists, and the
 * browser starts hydrating it while the response is still open. `@defer`
 * blocks with a `hydrate` trigger are the holes: Angular leaves their markup
 * alone until the trigger fires. Whatever the server renders into such a block
 * afterwards arrives as a chunk, and the inline runtime swaps it in front of
 * the block's anchor comment. This service does the three things that keep
 * Angular in step with that:
 *
 *  - it rewrites the hydration data Angular holds for the block, so hydrating
 *    it later walks the new markup rather than the shell's;
 *  - it holds back each HTTP request the server is already making, and lets it
 *    through once the response is in transfer state. The client then neither
 *    fetches twice nor learns anything before the markup rendered from it is
 *    in the document;
 *  - it keeps blocks whose trigger says nothing about their data — idle,
 *    timer, immediate, viewport — out of Angular's registry until the stream
 *    ends. Such a trigger can fire while the block's content is still on its
 *    way; it then waits the way a nested block waits for its parent, and
 *    resumes by itself on release.
 *
 * A `hydrate when` block needs no holding back. Its condition turns true off
 * data the stream delivered, and the markup for that data came in the same
 * chunk, so it hydrates as early as it correctly can.
 *
 * Without a runtime on the page — the buffered fallback, the server itself —
 * all of it is inert.
 *
 * It carries no decorator, so the package needs no Angular compilation: it is
 * reached through `STREAM_HYDRATION_CLIENT`, a root-provided token.
 */
export class StreamHydrationClient implements StreamSink {
  private readonly transferState = inject(TransferState);
  private readonly runtime: StreamRuntime | null =
    (globalThis as { __ngs?: StreamRuntime }).__ngs ?? null;

  private nghData: SerializedView[] | null = null;
  private deferData: Record<string, SerializedDeferBlock> = {};
  /** Every block's view, by id, wherever it sits in the hydration data. */
  private readonly views = new Map<string, SerializedView>();

  /** Blocks Angular has created a container for, hydrated or not. */
  private readonly blocks = new Map<string, DehydratedBlock>();
  /** Blocks whose registration is being withheld. */
  private readonly held = new Set<string>();
  /** Blocks that were hydrated or destroyed: their markup is Angular's now. */
  private readonly gone = new Set<string>();
  private readonly registered = new Set<string>();
  private register: ((blockId: string, info: DehydratedBlock) => void) | null = null;
  /** Blocks Angular has started hydrating, or will as soon as it can. */
  private triggered: { has(blockId: string): boolean } | null = null;

  private readonly pending = new Set<string>();
  private readonly waiters = new Map<string, Set<() => void>>();

  /** Takes over from the inline runtime. Runs before anything hydrates. */
  attach(): void {
    const runtime = this.runtime;
    if (runtime === null) {
      return;
    }

    this.nghData = this.transferState.get(NGH_DATA_KEY, null);
    for (const view of this.nghData ?? []) {
      this.indexViews(view);
    }
    this.deferData = this.transferState.get(NGH_DEFER_KEY, null) ?? {};
    this.transferState.set(NGH_DEFER_KEY, this.deferData);

    this.adopt(this.deferData);
    for (const key of runtime.p) {
      this.pending.add(key);
    }

    // Chunks that beat the app here already have their markup in place; only
    // the data is outstanding.
    for (const entry of runtime.log.splice(0)) {
      this.absorb(entry);
    }
    if (runtime.done) {
      this.held.clear();
    }

    runtime.sink = this;
  }

  rootNodes(block: StreamBlock): number | null {
    const view = this.views.get(block.id);
    if (this.nghData === null || view === undefined || !this.canFollowViewport(block)) {
      return null;
    }

    const info = this.blocks.get(block.id);
    const dehydrated =
      info === undefined
        ? // The view that declares the block has not hydrated yet.
          !this.gone.has(block.id)
        : asDehydratedViews(info).some((candidate) => candidate.data === view);
    if (!dehydrated) {
      return null;
    }

    const count = view[NGH.rootNodes];
    return typeof count === 'number' ? count : 0;
  }

  apply(entry: StreamLogEntry): void {
    this.absorb(entry);
    if (entry.chunk.done) {
      // A task later, so the requests released above have reached component
      // state before any block renders from it.
      setTimeout(() => this.release(), 0);
    }
  }

  /**
   * An observable that completes once the server has answered `key`, or null
   * when the server is not making that request.
   */
  released(key: string): Observable<void> | null {
    if (!this.pending.has(key)) {
      return null;
    }

    return new Observable<void>((subscriber) => {
      const resume = () => {
        subscriber.next();
        subscriber.complete();
      };
      const waiting = this.waiters.get(key) ?? new Set();
      this.waiters.set(key, waiting.add(resume));

      return () => waiting.delete(resume);
    });
  }

  /**
   * Wraps Angular's registry so held blocks stay out of it.
   *
   * Angular treats a block that is missing from the registry as one whose
   * parent has not hydrated yet: a trigger for it parks a callback that runs
   * when the block is added. Holding a block is leaving it out, and releasing
   * it is adding it.
   */
  gate<T>(registry: T): T {
    if (registry === null || this.runtime === null) {
      return registry;
    }

    const target = registry as unknown as BlockRegistry;
    const add = target.add.bind(target);
    const get = target.get.bind(target);
    const cleanup = target.cleanup.bind(target);

    this.triggered = target.hydrating;
    this.register = (blockId, info) => {
      this.registered.add(blockId);
      add(blockId, info);
    };
    target.add = (blockId, info) => {
      this.blocks.set(blockId, info);
      if (!this.held.has(blockId)) {
        this.register?.(blockId, info);
        return;
      }

      // A trigger for a missing block walks up its parents to find where
      // hydration has to start, and silently drops the trigger if it meets
      // one that is still marked as hydrating — which a parent stays until
      // the application is next stable. This block's parent has rendered, or
      // the block would not be here, so the walk can stop at the block.
      delete this.deferData[blockId]?.[NGH.parentBlockId];
    };
    target.get = (blockId) => {
      // Angular only looks a block up when it is about to hydrate it, for
      // instance because a block nested in it was triggered. The markup and
      // the data agree at every moment, so going early is safe; it only gives
      // up on later markup for this block.
      const info = this.blocks.get(blockId);
      if (info !== undefined && this.held.delete(blockId)) {
        this.register?.(blockId, info);
      }
      return get(blockId);
    };
    target.cleanup = (blockIds) => {
      for (const blockId of blockIds) {
        this.blocks.delete(blockId);
        this.held.delete(blockId);
        this.gone.add(blockId);
      }
      cleanup(blockIds);
    };

    return registry;
  }

  /** Folds a chunk's data into what Angular will hydrate from. */
  private absorb({ chunk, swapped }: StreamLogEntry): void {
    for (const block of chunk.b) {
      // Always appended, even for a block that was not replaced: positions in
      // this list are what later chunks' markup refers to.
      this.nghData?.push(...block.n);

      const swap = swapped[block.id];
      const view = this.views.get(block.id);
      if (swap === undefined || view === undefined) {
        continue;
      }

      // In place: Angular may already hold this very object as the data of a
      // dehydrated view, and has to see the new shape through it.
      for (const key of Object.keys(view)) {
        delete view[key];
      }
      Object.assign(view, block.v);
      this.indexViews(view);
      for (const entry of block.n) {
        this.indexViews(entry);
      }
      this.adopt(block.d);

      const info = this.blocks.get(block.id);
      const target = info && asDehydratedViews(info).find((candidate) => candidate.data === view);
      if (target) {
        target.firstChild = swap.first;
      }
    }

    for (const [key, value] of Object.entries(chunk.s)) {
      this.transferState.set(makeStateKey<unknown>(key), value);
    }

    this.pending.clear();
    for (const key of chunk.p) {
      this.pending.add(key);
    }
    for (const [key, waiting] of this.waiters) {
      if (!this.pending.has(key)) {
        this.waiters.delete(key);
        for (const resume of waiting) {
          resume();
        }
      }
    }
  }

  /**
   * Takes in defer info for blocks the document has just gained, and withholds
   * the ones whose triggers fire on their own schedule. Those are exactly the
   * triggers Angular serializes: idle, immediate, viewport and timer.
   */
  private adopt(blocks: Record<string, SerializedDeferBlock>): void {
    for (const [blockId, info] of Object.entries(blocks)) {
      this.deferData[blockId] = info;

      if (this.blocks.has(blockId)) {
        // Already rendered into by its parent; see `gate`.
        delete info[NGH.parentBlockId];
        continue;
      }

      const triggers = info[NGH.hydrateTriggers];
      if (!this.runtime?.done && Array.isArray(triggers) && triggers.length > 0) {
        this.held.add(blockId);
      }
    }
  }

  /** The stream is over: hand every held block to Angular. */
  private release(): void {
    const held = [...this.held];
    this.held.clear();

    for (const blockId of held) {
      const info = this.blocks.get(blockId);
      if (info !== undefined && !this.registered.has(blockId)) {
        this.register?.(blockId, info);
      }
    }
  }

  /**
   * A viewport trigger observes the elements it was set up with, and Angular
   * offers no way to move it onto replacement nodes. So once the application
   * is running, a block with one can only be replaced after the trigger has
   * fired, and a chunk cannot bring in new blocks that would need one.
   */
  private canFollowViewport(block: StreamBlock): boolean {
    return Object.entries(block.d).every(
      ([blockId, info]) =>
        !usesViewportTrigger(info) ||
        (blockId === block.id && this.triggered?.has(blockId) === true),
    );
  }

  private indexViews(view: SerializedView): void {
    const blockId = view[NGH.blockId];
    if (typeof blockId === 'string') {
      this.views.set(blockId, view);
    }

    const containers = view[NGH.containers];
    if (containers === null || typeof containers !== 'object') {
      return;
    }
    for (const views of Object.values(containers)) {
      if (Array.isArray(views)) {
        for (const child of views) {
          this.indexViews(child);
        }
      }
    }
  }
}

function asDehydratedViews(block: DehydratedBlock): DehydratedContainerView[] {
  const views = block.lContainer[DEHYDRATED_VIEWS];
  return Array.isArray(views) ? views : [];
}

function usesViewportTrigger(info: SerializedDeferBlock): boolean {
  const triggers = info[NGH.hydrateTriggers];
  return (
    Array.isArray(triggers) &&
    triggers.some(
      (trigger) => trigger === NGH.viewportTrigger || trigger?.trigger === NGH.viewportTrigger,
    )
  );
}

/** The application's one `StreamHydrationClient`. */
export const STREAM_HYDRATION_CLIENT = new InjectionToken<StreamHydrationClient>(
  'STREAM_HYDRATION_CLIENT',
  { providedIn: 'root', factory: () => new StreamHydrationClient() },
);

/**
 * On the server, reports each request to the streaming renderer. In the
 * browser, parks a request the server is already making until its response
 * has arrived on the stream, then lets it through to the transfer cache.
 */
export const streamHttpInterceptor: HttpInterceptorFn = (req, next) => {
  const key = streamRequestKey(req.method, req.urlWithParams);
  const tracker = inject(SERVER_REQUEST_TRACKER, { optional: true });
  if (tracker !== null) {
    return outsideAngular(inject(NgZone), () => next(req).pipe(finalize(tracker.track(key))));
  }

  const released = inject(STREAM_HYDRATION_CLIENT).released(key);
  return released === null ? next(req) : released.pipe(switchMap(() => next(req)));
};

/**
 * Subscribes outside the Angular zone, and hands every event back inside it.
 *
 * With Zone.js, a request in flight is a pending zone task, and the zone isn't
 * stable until it ends, so `whenStable()` would wait for the data and the
 * shell with it. The tracker is what follows requests during a streamed
 * render; outside the zone they stop counting, and change detection still runs
 * when their data arrives. Without Zone.js, `NgZone` runs both straight away.
 */
function outsideAngular<T>(zone: NgZone, request: () => Observable<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = zone.runOutsideAngular(() =>
      request().subscribe({
        next: (value) => zone.run(() => subscriber.next(value)),
        error: (error: unknown) => zone.run(() => subscriber.error(error)),
        complete: () => zone.run(() => subscriber.complete()),
      }),
    );
    return () => subscription.unsubscribe();
  });
}

/**
 * Angular's own factory for the dehydrated block registry. The token is public
 * enough to override but the factory behind it is not exported, so it is read
 * back out of the providers that install it.
 */
function findRegistryFactory(): (() => unknown) | null {
  const queue: unknown[] = [ɵwithIncrementalHydration()];
  while (queue.length > 0) {
    const candidate = queue.pop();
    if (Array.isArray(candidate)) {
      queue.push(...candidate);
    } else if (
      (candidate as { provide?: unknown } | null)?.provide === ɵDEHYDRATED_BLOCK_REGISTRY
    ) {
      return (candidate as { useFactory: () => unknown }).useFactory;
    }
  }

  return null;
}

/**
 * What a streamed render needs from the application's own injector. The
 * streaming renderer provides `SERVER_REQUEST_TRACKER` on the platform, so
 * these only change anything there; everywhere else, including a buffered
 * render on the server, they give what would be there without them.
 */
const STREAMED_RENDER_PROVIDERS: Provider[] = [
  // HTTP leaves `whenStable()` to the tracker, so the shell doesn't wait for data.
  {
    provide: ɵREQUESTS_CONTRIBUTE_TO_STABILITY,
    useFactory: () =>
      inject(SERVER_REQUEST_TRACKER, { optional: true }) === null &&
      (inject(ɵREQUESTS_CONTRIBUTE_TO_STABILITY, { skipSelf: true, optional: true }) ?? true),
  },
  // `@defer` blocks are rendered by the renderer, between change detection passes.
  {
    provide: ɵDEFER_BLOCK_CONFIG,
    useFactory: () =>
      inject(SERVER_REQUEST_TRACKER, { optional: true }) === null
        ? inject(ɵDEFER_BLOCK_CONFIG, { skipSelf: true, optional: true })
        : { behavior: ɵDeferBlockBehavior.Manual },
  },
];

/**
 * Lets `@defer` blocks with a `hydrate` trigger receive server-rendered
 * content after the shell. Must come after `provideClientHydration()`, whose
 * registry provider this replaces.
 *
 * On the server, it also brings what the streaming renderer needs from the
 * application's injector, so an application bootstrapped by a function of its
 * own (an Angular CLI app's `main.server.ts`) streams as well.
 */
export function provideStreamHydration(): EnvironmentProviders {
  const providers: Array<Provider | EnvironmentProviders> = [
    provideEnvironmentInitializer(() => inject(STREAM_HYDRATION_CLIENT).attach()),
    ...STREAMED_RENDER_PROVIDERS,
  ];

  const createRegistry = findRegistryFactory();
  if (createRegistry !== null) {
    providers.push({
      provide: ɵDEHYDRATED_BLOCK_REGISTRY,
      useFactory: () => inject(STREAM_HYDRATION_CLIENT).gate(createRegistry()),
    });
  }

  return makeEnvironmentProviders(providers);
}
