import {
  RX_CONCURRENT_STRATEGIES,
  RX_NATIVE_STRATEGIES,
  RxRenderStrategiesConfig,
} from '@rx-angular/cdk/render-strategies';

/**
 * Render-strategy configuration used during server-side rendering.
 *
 * The concurrent strategies schedule change detection asynchronously
 * (`requestAnimationFrame`/`postMessage`/`setTimeout`), which does not flush
 * deterministically during SSR/hydration. That makes an already-rendered view
 * drop back to its loading template and re-render after hydration (a visible
 * flicker). Mapping every strategy — native and concurrent alike — onto the
 * synchronous `native` strategy keeps server rendering deterministic and
 * eliminates the flicker.
 */
export const RxServerRenderStrategy: RxRenderStrategiesConfig<string> = {
  primaryStrategy: RX_NATIVE_STRATEGIES.native.name,
  customStrategies: {
    [RX_NATIVE_STRATEGIES.local.name]: {
      ...RX_NATIVE_STRATEGIES.native,
      name: RX_NATIVE_STRATEGIES.local.name,
    },
    ...Object.fromEntries(
      Object.keys(RX_CONCURRENT_STRATEGIES).map((name) => [
        name,
        { ...RX_NATIVE_STRATEGIES.native, name },
      ])
    ),
  },
};
