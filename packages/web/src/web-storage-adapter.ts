import {
  defineSyncAdapter,
  jsonSerializer,
  requireBackend,
  STORAGE_OPERATION,
} from "@platform-storage/core";
import type { BackendSource, StorageOperation, SyncStorageAdapter } from "@platform-storage/core";

/**
 * Reaches for a web `Storage`.
 *
 * A function rather than a value, because the access itself can fail: `window.localStorage` throws in Safari private browsing and in a sandboxed iframe, and `window` does not exist on a server. Calling it inside a guard on every operation is what turns those into a reported error rather than a crash while a module loads.
 */
export type WebStorageSource = BackendSource<Storage>;

export interface WebStorageAdapterOptions {
  /** Identifies the adapter in error messages. */
  readonly name?: string | undefined;
}

const PROBE_KEY = "__platform_storage_probe__";

/**
 * Reports whether a web storage object can actually be written to.
 *
 * The check writes and removes a probe key, because presence is not availability: Safari in private browsing and a sandboxed iframe both expose a `Storage` object whose `setItem` throws.
 */
export function isWebStorageAvailable(getStorage: WebStorageSource): boolean {
  try {
    const storage = getStorage();

    if (storage === undefined || storage === null) return false;

    storage.setItem(PROBE_KEY, PROBE_KEY);
    storage.removeItem(PROBE_KEY);

    return true;
  } catch {
    return false;
  }
}

/**
 * An adapter over any web `Storage`: `localStorage`, `sessionStorage`, or anything else with that shape.
 *
 * The storage is reached through `getStorage` on every operation rather than once at construction, so an adapter built while a module loads still works, and a storage that cannot be reached reports `StorageUnavailableError` instead of crashing. A storage that refuses a write, as an exhausted quota does, is let through in its own vocabulary for the engine to wrap as `StorageAdapterError` with the browser's exception as the cause.
 */
export function webStorageAdapter(
  getStorage: WebStorageSource,
  options: WebStorageAdapterOptions = {},
): SyncStorageAdapter<string> {
  const name = options.name ?? "web-storage";
  const reach = (operation: StorageOperation, physicalKey: string): Storage =>
    requireBackend(getStorage, { adapter: name, operation, physicalKey });

  return defineSyncAdapter({
    name,
    serializer: jsonSerializer,
    // `getItem` answers `null` for a missing key, and `null` is a wire value the JSON serializer would read back as a stored null.
    getSync: (key) => reach(STORAGE_OPERATION.Get, key).getItem(key) ?? undefined,
    setSync: (key, value) => {
      reach(STORAGE_OPERATION.Set, key).setItem(key, value);
    },
    removeSync: (key) => {
      reach(STORAGE_OPERATION.Remove, key).removeItem(key);
    },
    hasSync: (key) => reach(STORAGE_OPERATION.Has, key).getItem(key) !== null,
    isAvailable: () => isWebStorageAvailable(getStorage),
  });
}
