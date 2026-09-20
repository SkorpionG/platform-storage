import type { WebExtensionStorageNamespace } from "./types";

/** The globals an extension API lives on, in the order they are tried. */
const HOSTS = ["browser", "chrome"] as const;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Whether a value has the shape of a `storage` namespace. Only `local` is looked for, because whether any other area exists is decided when that area is addressed. */
function isStorageNamespace(value: unknown): value is WebExtensionStorageNamespace {
  return isObject(value) && "local" in value && isObject(value.local);
}

/**
 * Finds the `storage` namespace in this context: `browser.storage` where it exists, otherwise `chrome.storage`.
 *
 * `browser` comes first because it is promise-based everywhere it exists, whereas `chrome` is a compatibility namespace on Firefox. Both are read off `globalThis` as unknown values and narrowed by shape, so this package never depends on a browser type package. The answer is `undefined` where neither global is present, and also where `storage` is missing from the one that is, as it is in an extension that has not asked for the `storage` permission.
 *
 * @returns The namespace, or `undefined` where this context has none. Deciding what to do about that is the caller's.
 * @example
 * ```ts
 * if (resolveWebExtensionStorage() === undefined) showNoticeThatNothingWillPersist();
 * ```
 */
export function resolveWebExtensionStorage(): WebExtensionStorageNamespace | undefined {
  for (const host of HOSTS) {
    const api: unknown = Reflect.get(globalThis, host);

    if (!isObject(api) || !("storage" in api)) continue;
    if (isStorageNamespace(api.storage)) return api.storage;
  }

  return undefined;
}
