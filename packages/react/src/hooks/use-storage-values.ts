"use client";

import type {
  GetManyResult,
  KeyOf,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { announceWrites, subscribeToKeys } from "../store/changes";
import { readDeclaredValues } from "../store/declared";
import { asWriteOfAll, keysWritten } from "../store/key-list";
import { readStorageValues } from "../store/snapshot";
import type { SyncStorageValuesWriter } from "../types/hooks";
import { useKeyList } from "./use-key-list";

/**
 * What several keys hold, as one object, and a writer for them.
 *
 * Read during the render, as `useStorageValue` reads one key. The object keeps its identity until one of its keys changes, and only the keys that changed are read again, each once. A key shown by another hook as well is read once for both, and keys that moved together before anything read them, such as after a change naming no key, are read in one call to a backend that has one.
 *
 * The list may be written inline: the keys are taken each once and in one order, so a new array on every render neither resubscribes nor rebuilds the answer. Pass them as a literal list, since the answer is typed from them.
 *
 * On a server the render answers with what the schema alone declares for each key, and React is handed that same object for its first pass in the browser, as `useStorageValue` does.
 *
 * @param storage - A storage whose backend answers immediately, such as one from `createLocalStorage`.
 * @param keys - Which keys to read, completed from the schema. A key listed twice is read once.
 * @returns The values, keyed by the keys asked for, and a writer limited to them.
 * @example
 * ```tsx
 * const [{ theme, user }, writer] = useStorageValues(storage, ["theme", "user"]);
 *
 * <button onClick={() => writer.remove()}>Sign out</button>;
 * ```
 */
export function useStorageValues<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: SyncPlatformStorage<Definition>,
  keys: ReadonlyArray<Key>,
): readonly [GetManyResult<Definition, Key>, SyncStorageValuesWriter<Definition, Key>] {
  const unique = useKeyList(keys);

  const subscribe = useCallback(
    (listener: () => void) => subscribeToKeys(storage, unique, listener),
    [storage, unique],
  );
  const getSnapshot = useCallback(() => readStorageValues(storage, unique), [storage, unique]);
  const getServerSnapshot = useCallback(
    () => readDeclaredValues(storage, unique),
    [storage, unique],
  );

  const values = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const writer = useMemo<SyncStorageValuesWriter<Definition, Key>>(
    () => ({
      set: (next): void => {
        storage.setManySync(asWriteOfAll(next));
        announceWrites(storage, keysWritten(next));
      },
      remove: (removing = unique): void => {
        storage.removeManySync(removing);
        announceWrites(storage, removing);
      },
    }),
    [storage, unique],
  );

  return [values, writer];
}
