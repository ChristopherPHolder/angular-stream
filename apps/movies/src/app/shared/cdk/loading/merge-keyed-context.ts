import { WithContext } from './context.interface';

/**
 * Merges one emission of a keyed fetch into its `WithContext` slice: the
 * loading flags are replaced, the `value` dictionary is merged so entries
 * fetched earlier under other keys are kept.
 *
 * Both sides are routinely absent. The slice is undefined until its first
 * emission, and `withLoadingEmission()` opens with `{ loading: true }` and no
 * `value`. `patch` from `@rx-angular/cdk` handles that, but warns on every
 * non-object it is given, which logged three warnings on every first fetch,
 * so on every server-rendered request.
 */
export function mergeKeyedContext<T>(
  current: WithContext<Record<string, T>> | undefined,
  update: Partial<WithContext<Record<string, T>>>,
): WithContext<Record<string, T>> {
  const next = { ...current, ...update } as WithContext<Record<string, T>>;

  if (next.value !== undefined) {
    next.value = { ...current?.value, ...next.value };
  }

  return next;
}
