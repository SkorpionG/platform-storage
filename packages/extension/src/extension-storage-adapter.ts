import { passthroughSerializer, requireBackend, STORAGE_OPERATION } from "@platform-storage/core";
import type {
  BackendSource,
  JsonValue,
  StorageAdapter,
  StorageOperation,
} from "@platform-storage/core";
import { resolveExtensionStorage } from "./resolve-storage";
import { EXTENSION_STORAGE_AREA } from "./types";
import type {
  ExtensionStorageArea,
  ExtensionStorageAreaName,
  ExtensionStorageNamespace,
} from "./types";

export interface ExtensionStorageAdapterOptions {
  /** The area to store in. Defaults to `"local"`. */
  readonly area?: ExtensionStorageAreaName | undefined;
  /**
   * Where to find the `storage` namespace. Called on every operation, and defaults to `resolveExtensionStorage`.
   *
   * Give one to go through a polyfill's `browser` object, or to hand a test a fake.
   */
  readonly storage?: BackendSource<ExtensionStorageNamespace> | undefined;
  /** Identifies the adapter in error messages. Defaults to the area's own name, such as `storage.local`. */
  readonly name?: string | undefined;
}

/*
  The area answers with a record of only the keys it holds, so a key holding nothing is simply absent from it. Its values are declared `unknown` for the reason the area interface gives, but what comes back is whatever a `set` put there, which is the JSON value this adapter transports; the schema validates it before any caller sees it.
*/
function read(target: ExtensionStorageArea, key: string): Promise<JsonValue | undefined> {
  return target.get(key).then((found) => found[key] as JsonValue | undefined);
}

/**
 * An adapter over one WebExtension storage area.
 *
 * Values are handed to the area untouched, because it stores JSON values natively: encoding them would double-encode, spend the `sync` quota twice, and hide the value from any code that reads the key without this library.
 *
 * The namespace is resolved on every operation rather than once at construction, so an adapter built while a module loads works in whichever context the module ends up in, and a context with no extension API, or an area the browser does not have, reports `StorageUnavailableError` instead of crashing. A call the area rejects, as a `sync` write over quota is, is let through in the browser's own vocabulary for the engine to wrap as `StorageAdapterError` with that rejection as the cause.
 */
export function extensionStorageAdapter(
  options: ExtensionStorageAdapterOptions = {},
): StorageAdapter<JsonValue> {
  const area = options.area ?? EXTENSION_STORAGE_AREA.Local;
  const storage = options.storage ?? resolveExtensionStorage;
  const name = options.name ?? `storage.${area}`;

  const reach = (operation: StorageOperation, physicalKey: string): ExtensionStorageArea => {
    const context = { adapter: name, operation, physicalKey };
    const namespace = requireBackend(storage, context);

    return requireBackend(() => namespace[area], context);
  };

  // Starting from a resolved promise turns a failure to reach the area into a rejection, so a caller awaiting an operation never also has to wrap it in `try`.
  const run = <Value>(
    operation: StorageOperation,
    physicalKey: string,
    action: (target: ExtensionStorageArea) => Promise<Value>,
  ): Promise<Value> => Promise.resolve().then(() => action(reach(operation, physicalKey)));

  return {
    name,
    serializer: passthroughSerializer,
    get: (key) => run(STORAGE_OPERATION.Get, key, (target) => read(target, key)),
    set: (key, value) => run(STORAGE_OPERATION.Set, key, (target) => target.set({ [key]: value })),
    remove: (key) => run(STORAGE_OPERATION.Remove, key, (target) => target.remove(key)),
    isAvailable: () => {
      try {
        return storage()?.[area] !== undefined;
      } catch {
        return false;
      }
    },
  };
}
