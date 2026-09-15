"use client";

import { useSyncExternalStore } from "react";

import {
  getServerStorageErrors,
  getStorageErrors,
  subscribeToStorageErrors,
} from "../store/error-log";
import type { StorageErrorEntry } from "../types/hooks";

/**
 * Every failure the storages have reported, newest first.
 *
 * A read that falls back to its default is not silent, but it is invisible unless something is listening: pass `recordStorageError` as a storage's `onError` and this is where what it collects arrives.
 *
 * Empty on a server, because nothing has been read there yet.
 */
export function useStorageErrors(): ReadonlyArray<StorageErrorEntry> {
  return useSyncExternalStore(subscribeToStorageErrors, getStorageErrors, getServerStorageErrors);
}
