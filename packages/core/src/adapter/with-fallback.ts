import { isSyncStorageAdapter } from "./adapter";
import type { StorageAdapter, SyncStorageAdapter } from "./adapter";

/** Which of its two backends a `withFallback` adapter settled on. */
export interface FallbackChoice {
  /** `"primary"` or `"fallback"`, or `undefined` until first use decides. Asking never forces the decision. */
  chosen(): "primary" | "fallback" | undefined;
}

/**
 * Uses the first backend where it exists, and the second where it does not.
 *
 * The pattern this exists for is server rendering: pairing a platform adapter with `memoryAdapter()` builds one storage that works where the real backend exists and where it does not, so application code never branches on which it is running in.
 *
 * The choice is made on first use, which following its changes counts as, rather than at construction, because a storage is often built while a module is loading and long before anything reads from it. It is then kept, so every operation reaches the same backend and a value cannot be written to one and read from the other.
 *
 * The result is synchronous only when both halves are, since the type has to describe whichever one is chosen.
 *
 * @param primary - The backend to prefer. Its `isAvailable` decides; an adapter without one is treated as available.
 * @param fallback - Used when the primary is not available. It must transport the same wire type.
 * @returns One adapter over both, which can say which half it settled on. Synchronous only when both halves are, and able to list keys only when both halves can.
 * @example
 * ```ts
 * const storage = createStorage({
 *   schema,
 *   adapter: withFallback(localStorageAdapter(), memoryAdapter()),
 * });
 * ```
 */
export function withFallback<Wire>(
  primary: SyncStorageAdapter<Wire>,
  fallback: SyncStorageAdapter<Wire>,
): SyncStorageAdapter<Wire> & FallbackChoice;
export function withFallback<Wire>(
  primary: StorageAdapter<Wire>,
  fallback: StorageAdapter<Wire>,
): StorageAdapter<Wire> & FallbackChoice;
export function withFallback<Wire>(
  primary: StorageAdapter<Wire>,
  fallback: StorageAdapter<Wire>,
): StorageAdapter<Wire> & FallbackChoice {
  let chosen: StorageAdapter<Wire> | undefined;

  const select = (): StorageAdapter<Wire> => {
    chosen ??= (primary.isAvailable?.() ?? true) ? primary : fallback;
    return chosen;
  };

  const primaryKeys = primary.keys;
  const fallbackKeys = fallback.keys;

  const asyncAdapter: StorageAdapter<Wire> & FallbackChoice = {
    name: `${primary.name} (falling back to ${fallback.name})`,
    serializer: primary.serializer,

    get: (key) => select().get(key),
    set: (key, value) => select().set(key, value),
    remove: (key) => select().remove(key),
    has: (key) => {
      const selected = select();

      return selected.has === undefined
        ? selected.get(key).then((wire) => wire !== undefined)
        : selected.has(key);
    },
    isAvailable: () => select().isAvailable?.() ?? true,
    subscribe: (listener) =>
      select().subscribe?.(listener) ?? { stop: () => undefined, reportsOwnWrites: false },
    chosen: () => {
      if (chosen === undefined) return undefined;

      return chosen === primary ? "primary" : "fallback";
    },
    ...(primaryKeys === undefined || fallbackKeys === undefined
      ? {}
      : {
          /* `call`, because destructuring an optional method loses its receiver. */
          keys: () =>
            select() === primary ? primaryKeys.call(primary) : fallbackKeys.call(fallback),
        }),
  };

  if (!isSyncStorageAdapter(primary) || !isSyncStorageAdapter(fallback)) return asyncAdapter;

  /* Both halves are synchronous here, so whichever one `select` settled on is too. Comparing against it recovers that without asserting it. */
  const syncPrimary = primary;
  const syncFallback = fallback;
  const selectSync = (): SyncStorageAdapter<Wire> =>
    select() === syncPrimary ? syncPrimary : syncFallback;

  const primaryKeysSync = syncPrimary.keysSync;
  const fallbackKeysSync = syncFallback.keysSync;

  const syncAdapter: SyncStorageAdapter<Wire> & FallbackChoice = {
    ...asyncAdapter,

    getSync: (key) => selectSync().getSync(key),
    setSync: (key, value) => {
      selectSync().setSync(key, value);
    },
    removeSync: (key) => {
      selectSync().removeSync(key);
    },
    hasSync: (key) => {
      const selected = selectSync();

      return selected.hasSync === undefined
        ? selected.getSync(key) !== undefined
        : selected.hasSync(key);
    },
    ...(primaryKeysSync === undefined || fallbackKeysSync === undefined
      ? {}
      : {
          keysSync: () =>
            selectSync() === syncPrimary
              ? primaryKeysSync.call(syncPrimary)
              : fallbackKeysSync.call(syncFallback),
        }),
  };

  return syncAdapter;
}
