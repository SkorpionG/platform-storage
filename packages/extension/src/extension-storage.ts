import { createStorage } from "@platform-storage/core";
import type {
  CreateStorageOptions,
  JsonValue,
  PlatformStorage,
  StorageAdapter,
  StorageSchemaDefinition,
} from "@platform-storage/core";
import { extensionStorageAdapter } from "./extension-storage-adapter";
import type { ExtensionStorageAdapterOptions } from "./extension-storage-adapter";

/** Everything `createStorage` takes apart from the adapter, plus what the adapter itself takes. */
export type CreateExtensionStorageOptions<Definition extends StorageSchemaDefinition> = Omit<
  CreateStorageOptions<Definition, StorageAdapter<JsonValue>>,
  "adapter"
> &
  ExtensionStorageAdapterOptions;

/**
 * A storage over one WebExtension storage area, `local` unless another is named.
 *
 * Two areas are two storages, each over its own schema. That keeps a schema platform-agnostic: the same one can back `local` here, `localStorage` on the web, and AsyncStorage on a phone.
 *
 * @param options - The `schema`, the `area` to store in (`"local"` unless named), and optionally `onInvalid` and `onError`.
 * @returns A storage over that area. Asynchronous only, since an area always answers later.
 * @example
 * ```ts
 * const settings = createExtensionStorage({ schema });
 * const synced = createExtensionStorage({ schema: syncedSchema, area: "sync" });
 * ```
 */
export function createExtensionStorage<Definition extends StorageSchemaDefinition>(
  options: CreateExtensionStorageOptions<Definition>,
): PlatformStorage<Definition> {
  const { area, storage, name, ...storageOptions } = options;

  return createStorage({
    ...storageOptions,
    adapter: extensionStorageAdapter({ area, storage, name }),
  });
}
