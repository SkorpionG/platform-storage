import {
  defineSyncAdapter,
  jsonSerializer,
  requireBackend,
  STORAGE_OPERATION,
  StorageQuotaExceededError,
} from "@platform-storage/core";
import type { BackendSource, StorageOperation, SyncStorageAdapter } from "@platform-storage/core";

/**
 * Reaches for a web `Storage`.
 *
 * A function rather than a value, because the access itself can fail: `window.localStorage` throws in Safari private browsing and in a sandboxed iframe, and `window` does not exist on a server. Calling it inside a guard on every operation is what turns those into a reported error rather than a crash while a module loads.
 */
export type WebStorageSource = BackendSource<Storage>;

/** What the web adapters accept. */
export interface WebStorageAdapterOptions {
  /** Identifies the adapter in error messages. */
  readonly name?: string | undefined;
}

const PROBE_KEY = "__platform_storage_probe__";

/**
 * The names and legacy codes browsers report an exhausted origin allowance under.
 *
 * `QuotaExceededError` is the standard one, and what current Chromium, Firefox and WebKit all raise. Older Firefox raised `NS_ERROR_DOM_QUOTA_REACHED`, and older browsers set only the numeric `code`: 22 in the DOM specification, 1014 in Firefox. All four are checked because a caller that wants to evict and retry has to recognize the case wherever it runs.
 */
const QUOTA_NAMES: ReadonlySet<string> = new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);
const QUOTA_CODES: ReadonlySet<number> = new Set([22, 1014]);

/**
 * Whether the browser refused a write because the origin is full, rather than because it refuses writes at all.
 *
 * Safari in private browsing raises `QuotaExceededError` for every write, with an allowance of zero. The two are indistinguishable from the exception alone, which is why `isWebStorageAvailable` probes before a storage is ever chosen.
 *
 * @param cause - Whatever the browser threw.
 * @returns `true` when it says the origin is full.
 * @example
 * ```ts
 * try {
 *   localStorage.setItem("k", big);
 * } catch (error) {
 *   if (isQuotaExceeded(error)) evictSomething();
 * }
 * ```
 */
export function isQuotaExceeded(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const { name, code } = cause as { readonly name?: unknown; readonly code?: unknown };

  if (typeof name === "string" && QUOTA_NAMES.has(name)) return true;

  return typeof code === "number" && QUOTA_CODES.has(code);
}

/**
 * Reports whether a web storage object can actually be written to.
 *
 * The check writes and removes a probe key, because presence is not availability: Safari in private browsing and a sandboxed iframe both expose a `Storage` object whose `setItem` throws.
 *
 * @param getStorage - Reaches for the storage. It may throw, which counts as unavailable.
 * @returns `true` when a write succeeded.
 * @example
 * ```ts
 * if (!isWebStorageAvailable(() => window.localStorage)) showNoticeThatNothingWillPersist();
 * ```
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
 * The storage is reached through `getStorage` on every operation rather than once at construction, so an adapter built while a module loads still works, and one that cannot be reached reports `StorageUnavailableError` rather than crashing.
 *
 * A refused write is left in the browser's own vocabulary for the engine to wrap. The exception is a full origin, which this adapter names itself, because the browsers disagree about how they report one and a caller wanting to evict and retry should not have to know that.
 *
 * @param getStorage - Reaches for the storage, on every operation.
 * @param options - `name` to change what error messages call it. Defaults to `"web-storage"`.
 * @returns A synchronous adapter over that storage.
 * @example
 * ```ts
 * const adapter = webStorageAdapter(() => window.localStorage, { name: "localStorage" });
 * ```
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
      const storage = reach(STORAGE_OPERATION.Set, key);

      try {
        storage.setItem(key, value);
      } catch (cause) {
        /* Everything else is left to the engine, which wraps it as `StorageAdapterError` with the browser's exception as its cause. Only the full-origin case is named here, because only the adapter knows how this platform reports one. */
        if (!isQuotaExceeded(cause)) throw cause;

        throw new StorageQuotaExceededError({
          adapter: name,
          operation: STORAGE_OPERATION.Set,
          physicalKey: key,
          cause,
        });
      }
    },
    removeSync: (key) => {
      reach(STORAGE_OPERATION.Remove, key).removeItem(key);
    },
    hasSync: (key) => reach(STORAGE_OPERATION.Has, key).getItem(key) !== null,
    isAvailable: () => isWebStorageAvailable(getStorage),
  });
}
