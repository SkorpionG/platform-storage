import { jsonSerializer } from "@platform-storage/core";
import type { StorageAdapter } from "@platform-storage/core";
import type { AsyncStorageLike } from "./types";

export interface AsyncStorageAdapterOptions {
  /** Identifies the adapter in error messages. */
  readonly name?: string | undefined;
}

/**
 * An adapter over AsyncStorage, or over anything else with its `getItem`, `setItem` and `removeItem`.
 *
 * The instance is passed in rather than imported, which is what keeps this package free of a native module: it loads under a test runner or on a server, and any compatible storage an application already holds can be handed over instead. A call the storage rejects is let through in its own vocabulary for the engine to wrap as `StorageAdapterError` with that rejection as the cause.
 */
export function asyncStorageAdapter(
  asyncStorage: AsyncStorageLike,
  options: AsyncStorageAdapterOptions = {},
): StorageAdapter<string> {
  return {
    name: options.name ?? "AsyncStorage",
    serializer: jsonSerializer,
    // AsyncStorage says `null` for a missing key. The engine says `undefined`, because a schema may legitimately store `null`.
    get: (key) => asyncStorage.getItem(key).then((value) => value ?? undefined),
    set: (key, value) => asyncStorage.setItem(key, value),
    remove: (key) => asyncStorage.removeItem(key),
  };
}
