import { createStorage } from "@platform-storage/core";
import type {
  CreateStorageOptions,
  StorageSchemaDefinition,
  SyncPlatformStorage,
  SyncStorageAdapter,
} from "@platform-storage/core";
import { webStorageAdapter } from "./web-storage-adapter";
import type { WebStorageAdapterOptions } from "./web-storage-adapter";

/** Everything `createStorage` takes apart from the adapter, which the factory supplies. */
export type CreateWebStorageOptions<Definition extends StorageSchemaDefinition> = Omit<
  CreateStorageOptions<Definition, SyncStorageAdapter<string>>,
  "adapter"
>;

/*
  Both adapters read the storage off `window` rather than off `globalThis`. Node exposes a `localStorage` of its own, and a server has to look unavailable to these adapters so that `withFallback` moves on to the next backend instead of writing somewhere the browser will never read.
*/

/**
 * An adapter over `localStorage`, reached on every operation so a missing or refused storage is reported rather than fatal.
 *
 * @param options - `name` to change what error messages call it. Defaults to `"localStorage"`.
 * @returns A synchronous adapter, for `createStorage` or {@link withFallback}.
 * @example
 * ```ts
 * const adapter = withFallback(localStorageAdapter(), memoryAdapter());
 * ```
 */
export function localStorageAdapter(
  options: WebStorageAdapterOptions = {},
): SyncStorageAdapter<string> {
  return webStorageAdapter(() => window.localStorage, { name: options.name ?? "localStorage" });
}

/**
 * An adapter over `sessionStorage`, reached on every operation so a missing or refused storage is reported rather than fatal.
 *
 * @param options - `name` to change what error messages call it. Defaults to `"sessionStorage"`.
 * @returns A synchronous adapter, for `createStorage` or {@link withFallback}.
 * @example
 * ```ts
 * const storage = createStorage({ schema, adapter: sessionStorageAdapter() });
 * ```
 */
export function sessionStorageAdapter(
  options: WebStorageAdapterOptions = {},
): SyncStorageAdapter<string> {
  return webStorageAdapter(() => window.sessionStorage, {
    name: options.name ?? "sessionStorage",
  });
}

/**
 * A storage over `localStorage`.
 *
 * Web storage answers immediately, so the result carries the synchronous half as well: a first render can read `getSync` without a loading state.
 *
 * @param options - The `schema`, and optionally `onInvalid` and `onError`. The adapter is supplied for you.
 * @returns A storage carrying both halves of the API.
 * @example
 * ```ts
 * const storage = createLocalStorage({ schema });
 *
 * await storage.set("theme", "dark");
 * const theme = storage.getSync("theme");
 * ```
 */
export function createLocalStorage<Definition extends StorageSchemaDefinition>(
  options: CreateWebStorageOptions<Definition>,
): SyncPlatformStorage<Definition> {
  return createStorage({ ...options, adapter: localStorageAdapter() });
}

/**
 * A storage over `sessionStorage`, which the browser clears when the tab closes.
 *
 * Otherwise exactly {@link createLocalStorage}, including the synchronous half.
 *
 * @param options - The `schema`, and optionally `onInvalid` and `onError`.
 * @returns A storage carrying both halves of the API.
 * @example
 * ```ts
 * const draft = createSessionStorage({ schema });
 * ```
 */
export function createSessionStorage<Definition extends StorageSchemaDefinition>(
  options: CreateWebStorageOptions<Definition>,
): SyncPlatformStorage<Definition> {
  return createStorage({ ...options, adapter: sessionStorageAdapter() });
}
