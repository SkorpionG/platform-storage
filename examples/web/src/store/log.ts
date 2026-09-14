import type { PlatformStorageError } from "@platform-storage/web";

export interface LogEntry {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly message: string;
  readonly at: string;
  /** How many times in a row this same failure arrived. */
  readonly count: number;
}

let entries: ReadonlyArray<LogEntry> = [];
let nextId = 0;
let queued: Array<PlatformStorageError> = [];
let flushing = false;
const logListeners = new Set<() => void>();

function append(error: PlatformStorageError): void {
  const newest = entries[0];

  /*
    A value that stays corrupt fails again on every read the snapshot cache does not serve: a read asking for its own policy goes straight to the storage, several storages hold the same keys, and any write invalidates the cache for all of them. Collapsing an identical repeat into a count keeps that visible without burying the failures that differ.
  */
  if (newest !== undefined && newest.code === error.code && newest.message === error.message) {
    entries = [
      { ...newest, at: new Date().toLocaleTimeString(), count: newest.count + 1 },
      ...entries.slice(1),
    ];
    return;
  }

  nextId += 1;
  entries = [
    {
      id: nextId,
      code: error.code,
      name: error.name,
      message: error.message,
      at: new Date().toLocaleTimeString(),
      count: 1,
    },
    ...entries,
  ].slice(0, 40);
}

/**
 * The `onError` observer, wired to the panel in the right rail.
 *
 * Every storage reports through here, which is what keeps a falling-back read from being an invisible one: the value quietly becomes the default, and the reason still shows up on screen.
 *
 * The failures arrive mid-render, because the panels read with `getSync` while rendering and a corrupt value fails on the spot. Appending to the log there would move another component's state during someone else's render, so the batch is held and flushed once the render is over.
 */
export function record(error: PlatformStorageError): void {
  queued.push(error);

  if (flushing) return;
  flushing = true;

  queueMicrotask(() => {
    flushing = false;
    const batch = queued;
    queued = [];

    for (const failure of batch) append(failure);
    for (const listener of logListeners) listener();
  });
}

export function subscribeToLog(listener: () => void): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

export function getLog(): ReadonlyArray<LogEntry> {
  return entries;
}

/* Nothing has failed before the first render, and the browser's first pass has to print what the server did. One frozen array rather than a fresh one, so the snapshot holds still. */
const NOTHING: ReadonlyArray<LogEntry> = Object.freeze([]);

export function getServerLog(): ReadonlyArray<LogEntry> {
  return NOTHING;
}

export function clearLog(): void {
  entries = [];
  for (const listener of logListeners) listener();
}
