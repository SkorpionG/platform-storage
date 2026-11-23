import { createStorage } from "@platform-storage/core";
import type {
  CreateStorageOptions,
  FallbackOption,
  JsonValue,
  PlatformStorage,
  StorageAdapter,
  StorageSchemaDefinition,
} from "@platform-storage/core";
import { webExtensionStorageAdapter } from "./web-extension-storage-adapter";
import type { WebExtensionStorageAdapterOptions } from "./web-extension-storage-adapter";

/** Everything `createStorage` takes apart from the adapter, plus what the adapter itself takes. */
export interface CreateWebExtensionStorageOptions<Definition extends StorageSchemaDefinition>
  extends
    Omit<CreateStorageOptions<Definition, StorageAdapter<JsonValue>>, "adapter" | "fallback">,
    WebExtensionStorageAdapterOptions {
  /** Used where the area is not there, such as a page or a test with no extension API: another adapter holding JSON values, or `"memory"`. An adapter holding only text would turn an object into `"[object Object]"`. */
  readonly fallback?: FallbackOption<JsonValue> | undefined;
}

/**
 * A storage over one WebExtension storage area, `local` unless another is named.
 *
 * Two areas are two storages, each over its own schema. That keeps a schema platform-agnostic: the same one can back `local` here, `localStorage` on the web, and AsyncStorage on a phone.
 *
 * @param options - The `schema`, the `area` to store in (`"local"` unless named), and optionally `fallback` for where the area is not there, `prefix`, `readUnprefixed`, `onInvalid` and `onError`.
 * @returns A storage over that area. Asynchronous only, since an area always answers later.
 * @throws {StorageSchemaError} If `prefix` is empty, `readUnprefixed` is asked for without one, or the names a prefix gives clash.
 * @example
 * ```ts
 * const settings = createWebExtensionStorage({ schema });
 * const synced = createWebExtensionStorage({ schema: syncedSchema, area: "sync" });
 * ```
 */
export function createWebExtensionStorage<Definition extends StorageSchemaDefinition>(
  options: CreateWebExtensionStorageOptions<Definition>,
): PlatformStorage<Definition> {
  const { area, storage, name, ...storageOptions } = options;

  return createStorage({
    ...storageOptions,
    adapter: webExtensionStorageAdapter({ area, storage, name }),
  });
}
