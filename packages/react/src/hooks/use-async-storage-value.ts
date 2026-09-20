"use client";

import type { KeyOf, PlatformStorage, StorageSchemaDefinition } from "@platform-storage/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  getAsyncValueServerSnapshot,
  getAsyncValueSnapshot,
  subscribeToAsyncValue,
} from "../store/async-cache";
import { notifyStorageChanged } from "../store/changes";
import type { AsyncStorageWriter, AsyncStoredValue } from "../types/hooks";

/**
 * Writes to one key of a storage that only answers later, and tells everything reading it.
 *
 * Each promise settles exactly as the storage's own does, so a refused write is still a rejection and is not reported as a success. Nothing is announced when one fails, because nothing changed.
 *
 * @param storage - Any storage, including one that only answers later.
 * @param key - Which key to write. Completed from the schema.
 * @returns `set` and `remove` for that key, each returning a promise.
 * @example
 * ```tsx
 * const writer = useAsyncStorageWriter(storage, "lastSeen");
 *
 * <button onClick={() => void writer.set(Date.now())}>Mark seen</button>;
 * ```
 */
export function useAsyncStorageWriter<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: PlatformStorage<Definition>, key: Key): AsyncStorageWriter<Definition[Key]> {
  return useMemo(
    () => ({
      set: async (value) => {
        await storage.set(key, value);
        notifyStorageChanged(storage, key);
      },
      remove: async () => {
        await storage.remove(key);
        notifyStorageChanged(storage, key);
      },
    }),
    [storage, key],
  );
}

/**
 * What the key holds, once the storage has said, and the pair of writers for it.
 *
 * Works over any storage, including one that could have answered immediately, which is what lets an extension or a React Native app be written the same way as a browser one.
 *
 * The result reports `"loading"` until the first read lands, and `"ready"` afterwards even when the value is `undefined`: a key that holds nothing is an answer, not an absence of one. Branch on `status` rather than on the value, or the two collapse into each other.
 *
 * A write does not send it back to `"loading"`. The value already on screen stays there until the next read arrives, so nothing flashes.
 *
 * @param storage - Any storage, including one that only answers later.
 * @param key - Which key to read. Completed from the schema.
 * @returns The read, as `{ status, value, error }`, and the pair of writers for that key.
 * @example
 * ```tsx
 * const [result, writer] = useAsyncStorageValue(storage, "theme");
 *
 * if (result.status === "loading") return <Spinner />;
 * if (result.status === "failed") return <Problem error={result.error} />;
 *
 * return <button onClick={() => void writer.set("dark")}>{result.value}</button>;
 * ```
 */
export function useAsyncStorageValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: PlatformStorage<Definition>,
  key: Key,
): readonly [AsyncStoredValue<Definition[Key]>, AsyncStorageWriter<Definition[Key]>] {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToAsyncValue(storage, key, listener),
    [storage, key],
  );
  const getSnapshot = useCallback(() => getAsyncValueSnapshot(storage, key), [storage, key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getAsyncValueServerSnapshot);
  const writer = useAsyncStorageWriter(storage, key);

  return [value, writer];
}
