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

/** An adapter over `localStorage`, reached on every operation so a missing or refused storage is reported rather than fatal. */
export function localStorageAdapter(
  options: WebStorageAdapterOptions = {},
): SyncStorageAdapter<string> {
  return webStorageAdapter(() => window.localStorage, { name: options.name ?? "localStorage" });
}

/** An adapter over `sessionStorage`, reached on every operation so a missing or refused storage is reported rather than fatal. */
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

/** A storage over `sessionStorage`, otherwise exactly as `createLocalStorage`. */
export function createSessionStorage<Definition extends StorageSchemaDefinition>(
  options: CreateWebStorageOptions<Definition>,
): SyncPlatformStorage<Definition> {
  return createStorage({ ...options, adapter: sessionStorageAdapter() });
}
