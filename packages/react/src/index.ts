"use client";

/*
  The directive belongs on this file and not only on the modules below it. A bundler emits `"use client"` for a chunk only when the chunk's own entry module carries it, so a barrel that merely re-exports would ship a build with no directive at all, and nothing would warn.

  Named re-exports rather than `export *`, because a module carrying the directive has each of its exports turned into a client reference by name and a star crossing that boundary is fragile.
*/
export { createStorageHooks } from "./hooks/create-storage-hooks";
export type { AsyncStorageHooks, SyncStorageHooks } from "./hooks/create-storage-hooks";
export { useAsyncStorageValue, useAsyncStorageWriter } from "./hooks/use-async-storage-value";
export { useHydrated } from "./hooks/use-hydrated";
export { useStorageErrors } from "./hooks/use-storage-errors";
export { useStorageValue, useStorageWriter } from "./hooks/use-storage-value";

export { notifyStorageChanged, subscribeToStorage } from "./store/changes";
export { clearStorageErrors, recordStorageError } from "./store/error-log";

export { STORED_VALUE_STATUS } from "./types/hooks";
export type {
  AsyncStorageWriter,
  AsyncStoredValue,
  StorageErrorEntry,
  StoredValueStatus,
  SyncStorageWriter,
} from "./types/hooks";
