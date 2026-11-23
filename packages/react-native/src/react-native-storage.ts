import { createStorage } from "@platform-storage/core";
import type {
  CreateStorageOptions,
  FallbackOption,
  PlatformStorage,
  StorageAdapter,
  StorageSchemaDefinition,
} from "@platform-storage/core";
import { asyncStorageAdapter } from "./async-storage-adapter";
import type { AsyncStorageAdapterOptions } from "./async-storage-adapter";
import type { AsyncStorageLike } from "./types";

/** Everything `createStorage` takes apart from the adapter, plus the storage instance the adapter is built over. */
export interface CreateReactNativeStorageOptions<Definition extends StorageSchemaDefinition>
  extends
    Omit<CreateStorageOptions<Definition, StorageAdapter<string>>, "adapter" | "fallback">,
    AsyncStorageAdapterOptions {
  /**
   * The AsyncStorage instance, or anything with its shape. Supplied by the application, so this package never loads a native module.
   *
   * Required, so an application always says which one it means, but it may be `null` or `undefined` where there is none, such as on Expo's web build. Every operation then reports `StorageUnavailableError`, unless a `fallback` takes over.
   */
  readonly asyncStorage: AsyncStorageLike | null | undefined;
  /** Used where `asyncStorage` is not there: another adapter transporting text, or `"memory"`. */
  readonly fallback?: FallbackOption<string> | undefined;
}

/**
 * A storage over AsyncStorage.
 *
 * Every method returns a promise, because AsyncStorage only ever answers later: there is no synchronous half here. Named for the platform rather than the backend because AsyncStorage itself exports a `createAsyncStorage`, and two functions of that name in one file would be a trap.
 *
 * @param options - The `schema`, the `asyncStorage` instance to store through, and optionally `fallback` for where there is none, `prefix`, `readUnprefixed`, `onInvalid` and `onError`.
 * @returns A storage over that instance. Asynchronous only.
 * @throws {StorageSchemaError} If `prefix` is empty, `readUnprefixed` is asked for without one, or the names a prefix gives clash.
 * @example
 * ```ts
 * import AsyncStorage from "@react-native-async-storage/async-storage";
 *
 * const storage = createReactNativeStorage({ schema, asyncStorage: AsyncStorage });
 * ```
 */
export function createReactNativeStorage<Definition extends StorageSchemaDefinition>(
  options: CreateReactNativeStorageOptions<Definition>,
): PlatformStorage<Definition> {
  const { asyncStorage, name, ...storageOptions } = options;

  return createStorage({
    ...storageOptions,
    adapter: asyncStorageAdapter(asyncStorage, { name }),
  });
}
