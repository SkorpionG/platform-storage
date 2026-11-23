import {
  jsonSerializer,
  requireBackend,
  STORAGE_OPERATION,
  StorageUnavailableError,
} from "@platform-storage/core";
import type { StorageAdapter, StorageOperation } from "@platform-storage/core";
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

/** Whether an instance offers the three methods every operation needs. One without them counts as not there, so every operation reports it the same way. */
function isUsable(
  asyncStorage: AsyncStorageLike | null | undefined,
): asyncStorage is AsyncStorageLike {
  return (
    asyncStorage !== null &&
    asyncStorage !== undefined &&
    typeof asyncStorage.getItem === "function" &&
    typeof asyncStorage.setItem === "function" &&
    typeof asyncStorage.removeItem === "function"
  );
}

/**
 * An adapter over AsyncStorage, or over anything else with its `getItem`, `setItem` and `removeItem`.
 *
 * The instance is passed in rather than imported, which is what keeps this package free of a native module: it loads under a test runner or on a server, and any compatible storage an application already holds can be handed over instead. A call the storage rejects is let through in its own vocabulary for the engine to wrap as `StorageAdapterError` with that rejection as the cause.
 *
 * An instance that is not there, such as on Expo's web build or under a test runner with no native module, or one lacking `getItem`, `setItem` or `removeItem`, is reported rather than fatal: every operation answers `StorageUnavailableError`, and `isAvailable` says so, which is what lets `fallback` move on to another backend.
 *
 * @param asyncStorage - The instance to store through. Anything with `getItem`, `setItem` and `removeItem` will do. `null` or `undefined` where there is none.
 * @param options - `name` to change what error messages call it. Defaults to `"AsyncStorage"`.
 * @returns An asynchronous adapter over that instance, able to list every name it holds when the instance has `getAllKeys`, to clear all of it when it has `clear`, to work on several names in one call when it has AsyncStorage 3's or 2's batch methods, and to say whether the instance is there through `isAvailable`.
 * @example
 * ```ts
 * import AsyncStorage from "@react-native-async-storage/async-storage";
 *
 * const adapter = asyncStorageAdapter(AsyncStorage);
 * ```
 */
export function asyncStorageAdapter(
  asyncStorage: AsyncStorageLike | null | undefined,
  options: AsyncStorageAdapterOptions = {},
): StorageAdapter<string> {
  const name = options.name ?? "AsyncStorage";
  /* Reached on every operation, so an instance that is not there, or lacks what every operation needs, is reported as unavailable rather than as whatever a call on it throws. */
  const instance = (operation: StorageOperation, physicalKey: string): AsyncStorageLike =>
    requireBackend(() => (isUsable(asyncStorage) ? asyncStorage : undefined), {
      adapter: name,
      operation,
      physicalKey,
    });

  /* Each reaches the instance in the order it was called, as the optional methods below do, and turns a failure to reach it into a rejection. */
  const required: StorageAdapter<string> = {
    name,
    serializer: jsonSerializer,
    // AsyncStorage says `null` for a missing key. The engine says `undefined`, because a schema may legitimately store `null`.
    get: async (key) => (await instance(STORAGE_OPERATION.Get, key).getItem(key)) ?? undefined,
    set: async (key, value) => {
      await instance(STORAGE_OPERATION.Set, key).setItem(key, value);
    },
    remove: async (key) => {
      await instance(STORAGE_OPERATION.Remove, key).removeItem(key);
    },
    isAvailable: () => isUsable(asyncStorage),
  };

  /*
    With no usable instance there is nothing to list, clear or batch, but listing is still offered, reporting itself unavailable. A fallback offers a method only when both halves have it, so leaving it out would cost a storage falling back to memory its `clear("undeclared")`. Clearing needs no such stand-in, since `clear("everything")` lists instead where there is no `clear`.
  */
  if (!isUsable(asyncStorage)) {
    return {
      ...required,
      keys: () =>
        Promise.reject(
          new StorageUnavailableError({ adapter: name, operation: STORAGE_OPERATION.Keys }),
        ),
    };
  }

  const { getAllKeys, clear } = asyncStorage;

  return {
    ...required,
    // `call`, because destructuring an optional method loses its receiver.
    ...(getAllKeys === undefined ? {} : { keys: () => getAllKeys.call(asyncStorage) }),
    ...(clear === undefined ? {} : { clear: () => clear.call(asyncStorage) }),
    ...batches(asyncStorage),
  };
}
