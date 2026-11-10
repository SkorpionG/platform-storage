import { jsonSerializer } from "@platform-storage/core";
import type { StorageAdapter } from "@platform-storage/core";
import type { AsyncStorageLike } from "./types";

/** What {@link asyncStorageAdapter} accepts. */
export interface AsyncStorageAdapterOptions {
  /** Identifies the adapter in error messages. */
  readonly name?: string | undefined;
}

/* AsyncStorage says `null` for a missing name; the engine leaves a missing name out, because a schema may legitimately store `null`. */
function present(pairs: Iterable<readonly [string, string | null]>): ReadonlyMap<string, string> {
  return new Map([...pairs].filter((pair): pair is readonly [string, string] => pair[1] !== null));
}

/*
  The two majors batch under different names: 3 has `getMany`, `setMany` and `removeMany`, and 2 has `multiGet`, `multiSet` and `multiRemove`. Whichever the instance has is used, the newer first, and without either the engine reaches each name in turn. `call`, because a method taken off the instance loses its receiver.
*/
function batches(
  asyncStorage: AsyncStorageLike,
): Partial<Pick<StorageAdapter<string>, "getMany" | "setMany" | "removeMany">> {
  const { getMany, setMany, removeMany, multiGet, multiSet, multiRemove } = asyncStorage;

  return {
    ...(getMany !== undefined
      ? {
          getMany: (keys: ReadonlyArray<string>) =>
            getMany.call(asyncStorage, [...keys]).then((found) => present(Object.entries(found))),
        }
      : multiGet !== undefined
        ? {
            getMany: (keys: ReadonlyArray<string>) =>
              multiGet.call(asyncStorage, [...keys]).then(present),
          }
        : {}),
    ...(setMany !== undefined
      ? {
          setMany: (entries: ReadonlyMap<string, string>) =>
            setMany.call(asyncStorage, Object.fromEntries(entries)),
        }
      : multiSet !== undefined
        ? {
            setMany: (entries: ReadonlyMap<string, string>) =>
              multiSet.call(asyncStorage, [...entries]),
          }
        : {}),
    ...(removeMany !== undefined
      ? {
          removeMany: (keys: ReadonlyArray<string>) => removeMany.call(asyncStorage, [...keys]),
        }
      : multiRemove !== undefined
        ? {
            removeMany: (keys: ReadonlyArray<string>) => multiRemove.call(asyncStorage, [...keys]),
          }
        : {}),
  };
}

/**
 * An adapter over AsyncStorage, or over anything else with its `getItem`, `setItem` and `removeItem`.
 *
 * The instance is passed in rather than imported, which is what keeps this package free of a native module: it loads under a test runner or on a server, and any compatible storage an application already holds can be handed over instead. A call the storage rejects is let through in its own vocabulary for the engine to wrap as `StorageAdapterError` with that rejection as the cause.
 *
 * @param asyncStorage - The instance to store through. Anything with `getItem`, `setItem` and `removeItem` will do.
 * @param options - `name` to change what error messages call it. Defaults to `"AsyncStorage"`.
 * @returns An asynchronous adapter over that instance, able to list every name it holds when the instance has `getAllKeys`, and to work on several names in one call when it has AsyncStorage 3's or 2's batch methods.
 * @example
 * ```ts
 * import AsyncStorage from "@react-native-async-storage/async-storage";
 *
 * const adapter = asyncStorageAdapter(AsyncStorage);
 * ```
 */
export function asyncStorageAdapter(
  asyncStorage: AsyncStorageLike,
  options: AsyncStorageAdapterOptions = {},
): StorageAdapter<string> {
  const { getAllKeys } = asyncStorage;

  return {
    name: options.name ?? "AsyncStorage",
    serializer: jsonSerializer,
    // AsyncStorage says `null` for a missing key. The engine says `undefined`, because a schema may legitimately store `null`.
    get: (key) => asyncStorage.getItem(key).then((value) => value ?? undefined),
    set: (key, value) => asyncStorage.setItem(key, value),
    remove: (key) => asyncStorage.removeItem(key),
    // `call`, because destructuring an optional method loses its receiver.
    ...(getAllKeys === undefined ? {} : { keys: () => getAllKeys.call(asyncStorage) }),
    ...batches(asyncStorage),
  };
}
