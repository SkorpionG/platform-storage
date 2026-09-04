import { isSyncStorageAdapter } from "./adapter";
import type { StorageAdapter, SyncStorageAdapter } from "./adapter";

/**
 * Uses the first backend where it exists, and the second where it does not.
 *
 * The pattern this exists for is server rendering: `withFallback(localStorageAdapter(), memoryAdapter())` builds one storage that works in a browser and on a server, so application code never branches on which it is running in.
 *
 * The choice is made on first use rather than at construction, because a storage is often built while a module is loading and long before anything reads from it. It is then kept, so every operation reaches the same backend and a value cannot be written to one and read from the other.
 *
 * The result is synchronous only when both halves are, since the type has to describe whichever one is chosen.
 */
export function withFallback<Wire>(
  primary: SyncStorageAdapter<Wire>,
  fallback: SyncStorageAdapter<Wire>,
): SyncStorageAdapter<Wire>;
export function withFallback<Wire>(
  primary: StorageAdapter<Wire>,
  fallback: StorageAdapter<Wire>,
): StorageAdapter<Wire>;
export function withFallback<Wire>(
  primary: StorageAdapter<Wire>,
  fallback: StorageAdapter<Wire>,
): StorageAdapter<Wire> {
  let chosen: StorageAdapter<Wire> | undefined;

  const select = (): StorageAdapter<Wire> => {
    chosen ??= (primary.isAvailable?.() ?? true) ? primary : fallback;
    return chosen;
  };

  const asyncAdapter: StorageAdapter<Wire> = {
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
  };

  if (!isSyncStorageAdapter(primary) || !isSyncStorageAdapter(fallback)) return asyncAdapter;

  /* Both halves are synchronous here, so whichever one `select` settled on is too. Comparing against it recovers that without asserting it. */
  const syncPrimary = primary;
  const syncFallback = fallback;
  const selectSync = (): SyncStorageAdapter<Wire> =>
    select() === syncPrimary ? syncPrimary : syncFallback;

  const syncAdapter: SyncStorageAdapter<Wire> = {
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
  };

  return syncAdapter;
}
