import { createStorage } from "@platform-storage/core";
import type {
  CreateStorageOptions,
  PlatformStorage,
  StorageAdapter,
  StorageSchemaDefinition,
} from "@platform-storage/core";
import { asyncStorageAdapter } from "./async-storage-adapter";
import type { AsyncStorageAdapterOptions } from "./async-storage-adapter";
import type { AsyncStorageLike } from "./types";

/** Everything `createStorage` takes apart from the adapter, plus the storage instance the adapter is built over. */
export type CreateReactNativeStorageOptions<Definition extends StorageSchemaDefinition> = Omit<
  CreateStorageOptions<Definition, StorageAdapter<string>>,
  "adapter"
> &
  AsyncStorageAdapterOptions & {
    /** The AsyncStorage instance, or anything with its shape. Supplied by the application, so this package never loads a native module. */
    readonly asyncStorage: AsyncStorageLike;
  };

/**
 * A storage over AsyncStorage.
 *
 * Every method returns a promise, because AsyncStorage only ever answers later: there is no synchronous half here. Named for the platform rather than the backend because AsyncStorage itself exports a `createAsyncStorage`, and two functions of that name in one file would be a trap.
 *
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
