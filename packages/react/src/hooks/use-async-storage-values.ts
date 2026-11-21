"use client";

import type { KeyOf, PlatformStorage, StorageSchemaDefinition } from "@platform-storage/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  getAsyncValuesServerSnapshot,
  getAsyncValuesSnapshot,
  subscribeToAsyncValues,
} from "../store/async-many-cache";
import { announceWrites } from "../store/changes";
import { asWriteOfAll, keysWritten } from "../store/key-list";
import type { AsyncStorageValuesWriter, AsyncStoredValues } from "../types/hooks";
import { useKeyList } from "./use-key-list";

/**
 * What several keys hold, once the storage has said, and a writer for them.
 *
 * Every key is read in one backend call, which is what an extension's rate-limited `sync` area and AsyncStorage's native bridge want. A change to any of them reads them all again in one call, and changes arriving together, such as a `clear()` naming every key, are read once. A change landing during a read starts a read of its own, and the answer it overtook is never shown.
 *
 * One status for the whole read, since the one call lands or fails as a whole: `"loading"` until it lands, then `"ready"` with every key, or `"failed"` with the error. A write does not send it back to `"loading"`, so nothing flashes.
 *
 * The list may be written inline, and should be a literal list, as {@link useStorageValues} describes.
 *
 * @param storage - Any storage, including one that only answers later.
 * @param keys - Which keys to read, completed from the schema. A key listed twice is read once.
 * @returns The read, as `{ status, values, error }`, and a writer limited to those keys.
 * @example
 * ```tsx
 * const [result, writer] = useAsyncStorageValues(storage, ["theme", "user"]);
 *
 * if (result.status === "loading") return <Spinner />;
 * if (result.status === "failed") return <Problem error={result.error} />;
 *
 * return <button onClick={() => void writer.remove()}>{result.values.theme}</button>;
 * ```
 */
export function useAsyncStorageValues<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: PlatformStorage<Definition>,
  keys: ReadonlyArray<Key>,
): readonly [AsyncStoredValues<Definition, Key>, AsyncStorageValuesWriter<Definition, Key>] {
  const unique = useKeyList(keys);

  const subscribe = useCallback(
    (listener: () => void) => subscribeToAsyncValues(storage, unique, listener),
    [storage, unique],
  );
  const getSnapshot = useCallback(() => getAsyncValuesSnapshot(storage, unique), [storage, unique]);

  const values = useSyncExternalStore(subscribe, getSnapshot, getAsyncValuesServerSnapshot);
  const writer = useMemo<AsyncStorageValuesWriter<Definition, Key>>(
    () => ({
      set: async (next): Promise<void> => {
        await storage.setMany(asWriteOfAll(next));
        announceWrites(storage, keysWritten(next));
      },
      remove: async (removing = unique): Promise<void> => {
        await storage.removeMany(removing);
        announceWrites(storage, removing);
      },
    }),
    [storage, unique],
  );

  return [values, writer];
}
