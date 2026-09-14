"use client";

import type {
  GetResult,
  KeyOf,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/web";
import { useCallback, useSyncExternalStore } from "react";

import { bumpRevision, subscribeToRevision } from "../store/revision";
import { readDeclared, readStored } from "../store/snapshot";

/**
 * Re-reads whenever anything on the page writes, and renders the schema's own answer until it can.
 *
 * The server snapshot comes from an empty backend rather than from `getSync`, because a server has nothing to read and the browser's first pass has to produce the markup the server did. React swaps in the stored value once hydration is over, which is a repaint rather than a mismatch.
 *
 * Generic over the schema rather than tied to this demo's, because the hook is the shape a React binding package would publish and there is no reason to make that a rewrite.
 */
export function useStoredValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: SyncPlatformStorage<Definition>, key: Key): GetResult<Definition[Key]> {
  const getSnapshot = useCallback(() => readStored(storage, key), [storage, key]);
  const getServerSnapshot = useCallback(() => readDeclared(storage, key), [storage, key]);

  return useSyncExternalStore(subscribeToRevision, getSnapshot, getServerSnapshot);
}

/** Wraps a mutation so every panel re-reads afterwards. Stands in for the change subscription the library does not have yet. */
export function useWrite(): (mutate: () => void) => void {
  return useCallback((mutate: () => void) => {
    mutate();
    bumpRevision();
  }, []);
}
