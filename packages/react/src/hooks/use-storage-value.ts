"use client";

import type {
  GetResult,
  KeyOf,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { notifyStorageChanged, subscribeToStorage } from "../store/changes";
import { readDeclaredValue } from "../store/declared";
import { readStorageValue } from "../store/snapshot";
import type { SyncStorageWriter } from "../types/hooks";

/**
 * Writes to one key, and tells everything reading it.
 *
 * Use it where a component writes a key it never displays, so that it is not re-rendered by every change to a value it does not show.
 *
 * A write the schema refuses throws before anything is announced, because nothing changed.
 */
export function useStorageWriter<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: SyncPlatformStorage<Definition>, key: Key): SyncStorageWriter<Definition[Key]> {
  return useMemo(
    () => ({
      set: (value) => {
        storage.setSync(key, value);
        notifyStorageChanged(storage, key);
      },
      remove: () => {
        storage.removeSync(key);
        notifyStorageChanged(storage, key);
      },
    }),
    [storage, key],
  );
}

/**
 * What the key holds, and the pair of writers for it.
 *
 * The value is read during the render, with no promise and no loading state, because a synchronous storage answers immediately.
 *
 * On a server there is nothing to read, so the render falls back to what the schema alone answers with, and React is handed that same value for its first pass in the browser. That is what keeps the two in agreement; the stored value arrives the moment hydration ends, as a repaint rather than a mismatch.
 *
 * @example
 * ```tsx
 * const [theme, writer] = useStorageValue(storage, "theme");
 *
 * <button onClick={() => writer.set("dark")}>{theme}</button>;
 * ```
 */
export function useStorageValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: SyncPlatformStorage<Definition>,
  key: Key,
): readonly [GetResult<Definition[Key]>, SyncStorageWriter<Definition[Key]>] {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToStorage(storage, listener, key),
    [storage, key],
  );
  const getSnapshot = useCallback(() => readStorageValue(storage, key), [storage, key]);
  const getServerSnapshot = useCallback(() => readDeclaredValue(storage, key), [storage, key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const writer = useStorageWriter(storage, key);

  return [value, writer];
}
