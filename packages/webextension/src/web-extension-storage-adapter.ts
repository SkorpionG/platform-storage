import {
  passthroughSerializer,
  requireBackend,
  STORAGE_OPERATION,
  StorageQuotaExceededError,
} from "@platform-storage/core";
import type {
  BackendSource,
  JsonValue,
  StorageAdapter,
  StorageOperation,
} from "@platform-storage/core";
import { resolveWebExtensionStorage } from "./resolve-storage";
import { WEB_EXTENSION_STORAGE_AREA } from "./types";
import type {
  WebExtensionStorageArea,
  WebExtensionStorageAreaName,
  WebExtensionStorageChange,
  WebExtensionStorageNamespace,
} from "./types";

/** What {@link webExtensionStorageAdapter} accepts. */
export interface WebExtensionStorageAdapterOptions {
  /** The area to store in. Defaults to `"local"`. */
  readonly area?: WebExtensionStorageAreaName | undefined;
  /**
   * Where to find the `storage` namespace. Called on every operation, and defaults to `resolveWebExtensionStorage`.
   *
   * Give one to go through a polyfill's `browser` object, or to hand a test a fake.
   */
  readonly storage?: BackendSource<WebExtensionStorageNamespace> | undefined;
  /** Identifies the adapter in error messages. Defaults to the area's own name, such as `storage.local`. */
  readonly name?: string | undefined;
}

/*
  The area answers with a record of only the keys it holds, so a key holding nothing is simply absent from it. Its values are declared `unknown` for the reason the area interface gives, but what comes back is whatever a `set` put there, which is the JSON value this adapter transports; the schema validates it before any caller sees it.
*/
function read(target: WebExtensionStorageArea, key: string): Promise<JsonValue | undefined> {
  return target.get(key).then((found) => found[key] as JsonValue | undefined);
}

/* Only the names the area answered for, since a name holding nothing is simply absent from its record. */
function readMany(
  target: WebExtensionStorageArea,
  keys: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, JsonValue>> {
  return target
    .get([...keys])
    .then(
      (found) =>
        new Map(
          keys
            .filter((key) => Object.hasOwn(found, key))
            .map((key) => [key, found[key] as JsonValue]),
        ),
    );
}

/**
 * The limits an area names when a write does not fit.
 *
 * An extension area reports a full quota in its message rather than with an error type of its own, and the message names the limit that was passed: the area's total in `QUOTA_BYTES`, one item's share in `QUOTA_BYTES_PER_ITEM`, and the `sync` area's rate limits in the two `MAX_` ones. Matched case-insensitively, since Chrome and Firefox word the surrounding sentence differently.
 */
const QUOTA_LIMITS: ReadonlyArray<string> = [
  "QUOTA_BYTES",
  "QUOTA_BYTES_PER_ITEM",
  "MAX_ITEMS",
  "MAX_WRITE_OPERATIONS",
];

function isQuotaRejection(cause: unknown): boolean {
  const message: unknown =
    typeof cause === "object" && cause !== null
      ? (cause as { readonly message?: unknown }).message
      : cause;

  if (typeof message !== "string") return false;

  const upper = message.toUpperCase();

  return QUOTA_LIMITS.some((limit) => upper.includes(limit));
}

/**
 * An adapter over one WebExtension storage area.
 *
 * Values are handed to the area untouched, because it stores JSON values natively: encoding them would double-encode, spend the `sync` quota twice, and hide the value from any code that reads the key without this library.
 *
 * The namespace is resolved on every operation rather than once at construction, so an adapter built while a module loads works in whichever context it ends up in. A context with no extension API, and an area the browser does not have, both report `StorageUnavailableError` rather than crashing.
 *
 * A rejected call is left in the browser's own vocabulary for the engine to wrap, which `keys` is not, since it is called on the adapter directly. The exception is a full area, which this adapter names itself: an area reports one in its message rather than with an error type, so reading that is the adapter's job rather than the caller's.
 *
 * @param options - `area` to store in, `name` for error messages, and `namespace` to supply the extension API yourself, which is what a polyfill or a test fake does.
 * @returns An asynchronous adapter over that area, able to list every name it holds, to read, write and remove several in one call, and to follow changes from every context.
 * @example
 * ```ts
 * const adapter = webExtensionStorageAdapter({ area: "sync" });
 * ```
 */
export function webExtensionStorageAdapter(
  options: WebExtensionStorageAdapterOptions = {},
): StorageAdapter<JsonValue> {
  const area = options.area ?? WEB_EXTENSION_STORAGE_AREA.Local;
  const storage = options.storage ?? resolveWebExtensionStorage;
  const name = options.name ?? `storage.${area}`;

  const reach = (
    operation: StorageOperation,
    physicalKey: string | undefined,
  ): WebExtensionStorageArea => {
    const context = { adapter: name, operation, physicalKey };
    const namespace = requireBackend(storage, context);

    return requireBackend(() => namespace[area], context);
  };

  // Starting from a resolved promise turns a failure to reach the area into a rejection, so a caller awaiting an operation never also has to wrap it in `try`.
  const run = <Value>(
    operation: StorageOperation,
    physicalKey: string | undefined,
    action: (target: WebExtensionStorageArea) => Promise<Value>,
  ): Promise<Value> =>
    Promise.resolve()
      .then(() => action(reach(operation, physicalKey)))
      .catch((cause: unknown) => {
        /* Everything else is left to the engine, which wraps it as `StorageAdapterError` with the browser's rejection as its cause. Only a full area is named here, because only the adapter can read the limit out of the message. */
        if (!isQuotaRejection(cause)) throw cause;

        throw new StorageQuotaExceededError({ adapter: name, operation, physicalKey, cause });
      });

  return {
    name,
    serializer: passthroughSerializer,
    get: (key) => run(STORAGE_OPERATION.Get, key, (target) => read(target, key)),
    set: (key, value) => run(STORAGE_OPERATION.Set, key, (target) => target.set({ [key]: value })),
    remove: (key) => run(STORAGE_OPERATION.Remove, key, (target) => target.remove(key)),
    getMany: (keys) =>
      run(STORAGE_OPERATION.GetMany, undefined, (target) => readMany(target, keys)),
    setMany: (entries) =>
      run(STORAGE_OPERATION.SetMany, undefined, (target) =>
        target.set(Object.fromEntries(entries)),
      ),
    removeMany: (keys) =>
      run(STORAGE_OPERATION.RemoveMany, undefined, (target) => target.remove([...keys])),
    keys: () =>
      run(STORAGE_OPERATION.Keys, undefined, (target) =>
        target.getKeys === undefined
          ? target.get(null).then((everything) => Object.keys(everything))
          : target.getKeys(),
      ),
    subscribe: (listener) => {
      let changed: WebExtensionStorageNamespace["onChanged"];

      try {
        changed = storage()?.onChanged;
      } catch {
        changed = undefined;
      }

      if (changed === undefined) return { stop: () => undefined, reportsOwnWrites: false };

      const feed = changed;

      /* The values were stored through this adapter's own transport, and the schema validates them before any caller sees them. */
      const onChanged = (
        changes: Record<string, WebExtensionStorageChange>,
        areaName: string,
      ): void => {
        if (areaName !== area) return;

        for (const [key, change] of Object.entries(changes)) {
          listener({
            key,
            oldValue: change.oldValue as JsonValue | undefined,
            newValue: change.newValue as JsonValue | undefined,
          });
        }
      };

      feed.addListener(onChanged);

      return {
        stop: () => {
          feed.removeListener(onChanged);
        },
        reportsOwnWrites: true,
      };
    },
    isAvailable: () => {
      try {
        return storage()?.[area] !== undefined;
      } catch {
        return false;
      }
    },
  };
}
