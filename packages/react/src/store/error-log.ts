import type { PlatformStorageError } from "@platform-storage/core";

import type { StorageErrorEntry } from "../types/hooks";

/* Old failures stop being interesting long before they stop arriving, and an unbounded list in a long-lived tab is a leak. */
const LIMIT = 50;

/* Nothing has failed before the first render, and the browser's first pass has to print what the server did. One frozen array rather than a fresh one, so the snapshot holds still. */
const NOTHING: ReadonlyArray<StorageErrorEntry> = Object.freeze([]);

let entries: ReadonlyArray<StorageErrorEntry> = NOTHING;
let nextId = 0;
let queued: Array<PlatformStorageError> = [];
let flushing = false;
const listeners = new Set<() => void>();

function sameFailure(entry: StorageErrorEntry, error: PlatformStorageError): boolean {
  return entry.error.code === error.code && entry.error.message === error.message;
}

function append(error: PlatformStorageError): void {
  const newest = entries[0];

  /*
    A value that stays invalid fails again on every read that is not served from the cache, and several storages may hold the same key. Collapsing an identical repeat into a count keeps that visible without burying the failures that differ.
  */
  if (newest !== undefined && sameFailure(newest, error)) {
    entries = [{ ...newest, at: Date.now(), count: newest.count + 1 }, ...entries.slice(1)];
    return;
  }

  nextId += 1;
  entries = [{ id: nextId, error, at: Date.now(), count: 1 }, ...entries].slice(0, LIMIT);
}

/**
 * The observer to hand to a storage's `onError`.
 *
 * Without one, a read that falls back to its default is silent: the value quietly becomes the default and nothing says why. This collects the reasons so a component can show them.
 *
 * Failures arrive during a render, because a synchronous read happens while rendering and an invalid value fails on the spot. Publishing there would move another component's state in the middle of someone else's render, so the batch is held and flushed once the render is over.
 */
export function recordStorageError(error: PlatformStorageError): void {
  queued.push(error);

  if (flushing) return;
  flushing = true;

  /* A resolved promise rather than `queueMicrotask`, which every runtime has but TypeScript declares only in `lib.dom` and `lib.webworker`: a React Native application compiles with neither, and this package has to typecheck there too. */
  void Promise.resolve().then(() => {
    flushing = false;
    const batch = queued;
    queued = [];

    for (const failure of batch) append(failure);
    for (const listener of Array.from(listeners)) listener();
  });
}

export function subscribeToStorageErrors(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getStorageErrors(): ReadonlyArray<StorageErrorEntry> {
  return entries;
}

export function getServerStorageErrors(): ReadonlyArray<StorageErrorEntry> {
  return NOTHING;
}

/** Empties the log, for a control that dismisses what has been read. */
export function clearStorageErrors(): void {
  entries = NOTHING;
  for (const listener of Array.from(listeners)) listener();
}
