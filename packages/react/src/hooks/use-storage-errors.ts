"use client";

import { useSyncExternalStore } from "react";

import { getServerStorageErrors, sharedStorageErrorLog } from "../store/error-log";
import type { StorageErrorEntry, StorageErrorLog } from "../types/hooks";

/**
 * Every failure a log has collected, newest first.
 *
 * A read that falls back to its default is not silent, but it is invisible unless something is listening: pass `recordStorageError` as a storage's `onError` and this is where what it collects arrives. A storage handed the `record` of its own `createStorageErrorLog()` is read by passing that log.
 *
 * Empty on a server whichever log it reads, because the browser's first pass has to print what the server did. Server code reads a log's `entries()` directly.
 *
 * @param log - The log to read, built once outside any component. Defaults to the shared log `recordStorageError` collects into.
 * @returns Every failure collected so far, newest first. Identical repeats arrive as one entry with a count.
 * @example
 * ```tsx
 * const failures = useStorageErrors();
 *
 * return <ul>{failures.map((entry) => <li key={entry.id}>{entry.error.message}</li>)}</ul>;
 * ```
 */
export function useStorageErrors(
  log: StorageErrorLog = sharedStorageErrorLog,
): ReadonlyArray<StorageErrorEntry> {
  return useSyncExternalStore(log.subscribe, log.entries, getServerStorageErrors);
}
