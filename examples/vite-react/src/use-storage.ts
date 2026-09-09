import type { AppDefinition, AppKey } from "@examples/schema";
import type { GetResult, SyncPlatformStorage } from "@platform-storage/web";
import { useCallback, useSyncExternalStore } from "react";

import { bumpRevision, getRevision, subscribeToRevision } from "./storage";

/** Re-reads whenever anything on the page writes. Stands in for the change subscription the library does not have yet. */
export function useStoredValue<Key extends AppKey>(
  storage: SyncPlatformStorage<AppDefinition>,
  key: Key,
): GetResult<AppDefinition[Key]> {
  const read = useCallback(() => storage.getSync(key), [storage, key]);

  useSyncExternalStore(subscribeToRevision, getRevision);

  return read();
}

/** Wraps a mutation so every panel re-reads afterwards. */
export function useWrite(): (mutate: () => void) => void {
  return useCallback((mutate: () => void) => {
    mutate();
    bumpRevision();
  }, []);
}
