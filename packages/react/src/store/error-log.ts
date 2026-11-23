import type { PlatformStorageError } from "@platform-storage/core";

import type { StorageErrorEntry, StorageErrorLog } from "../types/hooks";

/* Old failures stop being interesting long before they stop arriving, and an unbounded list in a long-lived tab is a leak. */
const LIMIT = 50;

/* Nothing has failed before the first render, and the browser's first pass has to print what the server did. One frozen array rather than a fresh one, so the snapshot holds still. */
const NOTHING: ReadonlyArray<StorageErrorEntry> = Object.freeze([]);

function sameFailure(entry: StorageErrorEntry, error: PlatformStorageError): boolean {
  return entry.error.code === error.code && entry.error.message === error.message;
}

/**
 * A log of its own, for storages whose failures should be kept apart from every other storage's.
 *
 * The shared log behind `recordStorageError` is one per process, which is right in a browser and wrong on a server, where every request shares it. A request that builds its own storage builds its own log beside it, and reads that request's failures alone. In a browser, one part of an application can keep its own the same way.
 *
 * A failure is published at once while nothing is listening, which is always the case on a server, so the log answers the moment a read has failed. While something listens, it waits for the end of the turn, because failures arrive during a render and telling a listener there would move another component's state in the middle of someone else's render.
 *
 * @returns A log whose `record` is the observer to hand to a storage's `onError`, read through `entries()` or `useStorageErrors(log)`. Build it once, outside any component.
 * @example
 * ```ts
 * const log = createStorageErrorLog();
 * const storage = createLocalStorage({ schema, fallback: "memory", onError: log.record });
 *
 * storage.getSync("theme");
 * const failures = log.entries();
 * ```
 */
export function createStorageErrorLog(): StorageErrorLog {
  let entries: ReadonlyArray<StorageErrorEntry> = NOTHING;
  let nextId = 0;
  let queued: Array<PlatformStorageError> = [];
  let flushing = false;
  const listeners = new Set<() => void>();

  const append = (error: PlatformStorageError): void => {
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
  };

  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener();
  };

  /* Whatever is still waiting goes first, so the order failures arrived in survives a listener leaving between them. */
  const publish = (): void => {
    if (queued.length === 0) return;

    const batch = queued;
    queued = [];

    for (const failure of batch) append(failure);
    notify();
  };

  return {
    record: (error) => {
      queued.push(error);

      if (listeners.size === 0) {
        publish();
        return;
      }

      if (flushing) return;
      flushing = true;

      /* A resolved promise rather than `queueMicrotask`, which a React Native application compiles without. */
      void Promise.resolve().then(() => {
        flushing = false;
        publish();
      });
    },
    /* What is still waiting for the end of the turn stays waiting: nobody has seen it yet, so it is not among what a dismissal dismisses. */
    clear: () => {
      entries = NOTHING;
      notify();
    },
    entries: () => entries,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The log every storage handed `recordStorageError` reports to, and the one `useStorageErrors()` reads with no argument. */
export const sharedStorageErrorLog: StorageErrorLog = createStorageErrorLog();

/**
 * The observer to hand to a storage's `onError`, collecting into the one log every such storage shares.
 *
 * Without one, a read that falls back to its default is silent: the value quietly becomes the default and nothing says why. This collects the reasons so a component can show them. A storage whose failures should be kept apart, such as one built for a single server request, takes the `record` of its own `createStorageErrorLog()` instead.
 *
 * @param error - The failure, as the storage reports it.
 * @example
 * ```ts
 * const storage = createLocalStorage({ schema, onError: recordStorageError });
 * ```
 */
export function recordStorageError(error: PlatformStorageError): void {
  sharedStorageErrorLog.record(error);
}

/** What a server render sees: always the same empty array, since the browser's first pass has to print the same. */
export function getServerStorageErrors(): ReadonlyArray<StorageErrorEntry> {
  return NOTHING;
}

/**
 * Empties the shared log, for a control that dismisses what has been read.
 *
 * @example
 * ```tsx
 * <button onClick={clearStorageErrors}>Dismiss</button>;
 * ```
 */
export function clearStorageErrors(): void {
  sharedStorageErrorLog.clear();
}
