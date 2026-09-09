import { appSchema } from "@examples/schema";
import { createLocalStorage, createSessionStorage } from "@platform-storage/web";
import type { KeyDefinition, PlatformStorageError } from "@platform-storage/web";

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
    Nothing caches a read, so every re-render reads every key and a value that stays corrupt fails again each time. Collapsing an identical repeat into a count keeps that visible without burying the failures that differ.
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
 * Every storage below reports through here, which is what keeps a falling-back read from being an invisible one: the value quietly becomes the default, and the reason still shows up on screen.
 *
 * The failures arrive mid-render, because the panels read with `getSync` while rendering and a corrupt value fails on the spot. Appending to the log there would move another component's state during someone else's render, so the batch is held and flushed once the render is over.
 */
function record(error: PlatformStorageError): void {
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

export function clearLog(): void {
  entries = [];
  for (const listener of logListeners) listener();
}

/*
  Change subscription is not part of the library yet, so nothing tells the page a value moved. Every mutation bumps this counter instead and the hooks re-read, which is exactly the loop a `storage.subscribe` would replace.
*/
let revision = 0;
const revisionListeners = new Set<() => void>();

export function bumpRevision(): void {
  revision += 1;
  for (const listener of revisionListeners) listener();
}

export function subscribeToRevision(listener: () => void): () => void {
  revisionListeners.add(listener);
  return () => revisionListeners.delete(listener);
}

export function getRevision(): number {
  return revision;
}

/** The same schema, over the two web backends. Neither knows about the other. */
export const local = createLocalStorage({ schema: appSchema, onError: record });
export const session = createSessionStorage({ schema: appSchema, onError: record });

/*
  An invalid-data callback is handed the logical key as a plain string, so recovering the key's own default means a lookup built once rather than an index into the definition.
*/
const DECLARED_DEFAULTS: Readonly<Record<string, unknown>> = Object.fromEntries(
  appSchema.keys.map((key) => {
    const definition: KeyDefinition = appSchema.definition[key];
    return [key, definition.default];
  }),
);

/**
 * The same `localStorage`, read through a storage-level callback policy.
 *
 * A callback is the fourth thing `onInvalid` accepts, and it is declared here rather than per call because the storage-level layer is typed against `unknown`, so one function can serve every key. Per call the return is checked against the single key being read, which is stricter and the better choice when the key is known.
 */
export const localRecovering = createLocalStorage({
  schema: appSchema,
  onError: record,
  onInvalid: (context) => DECLARED_DEFAULTS[context.key],
});
