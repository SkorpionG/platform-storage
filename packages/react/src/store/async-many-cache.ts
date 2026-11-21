import type {
  KeyOf,
  PlatformStorage,
  PlatformStorageError,
  StorageSchemaDefinition,
} from "@platform-storage/core";

import type { AsyncStoredValues } from "../types/hooks";
import { generationOf, subscribeToKeys } from "./changes";
import { signatureOf, uniqueKeys } from "./key-list";
import { entriesFor } from "./per-storage";
import { asStorageError } from "./storage-error";

/*
  One object for every list that has not been read yet, so a first snapshot holds its identity across renders. It names no schema, so it is already assignable to the public type for every list of keys.

  Its own, rather than the single-key cache's, because the two shapes differ in exactly the field that carries the answer: `values` here, `value` there.
*/
const LOADING = Object.freeze({
  status: "loading",
  values: undefined,
  error: undefined,
} as const);

/* What a state holds between reads. Only the `ready` member differs from the public type, and only in its values, which is why a snapshot is narrowed on the way out. */
type StoredSnapshot =
  | typeof LOADING
  | {
      readonly status: "ready";
      readonly values: Readonly<Record<string, unknown>>;
      readonly error: undefined;
    }
  | { readonly status: "failed"; readonly values: undefined; readonly error: PlatformStorageError };

interface AsyncValuesState {
  snapshot: StoredSnapshot;
  /** Increments the moment a read is asked for, so an answer that a change has already overtaken is dropped even if it lands before the next read starts. */
  reading: number;
  /** Each key's generation when the last read started, so a change made while nobody was watching is not missed. */
  readAt: ReadonlyArray<number> | undefined;
  /** A read is waiting for the end of this turn, so changes arriving together are read once. */
  queued: boolean;
  unwatch: (() => void) | undefined;
  readonly listeners: Set<() => void>;
}

const states = new WeakMap<object, Map<string, AsyncValuesState>>();

function stateFor(storage: object, keys: ReadonlyArray<string>): AsyncValuesState {
  const byList = entriesFor(states, storage);
  const signature = signatureOf(keys);
  const state = byList.get(signature);

  if (state !== undefined) return state;

  const created: AsyncValuesState = {
    snapshot: LOADING,
    reading: 0,
    readAt: undefined,
    queued: false,
    unwatch: undefined,
    listeners: new Set<() => void>(),
  };

  byList.set(signature, created);

  return created;
}

function publish(state: AsyncValuesState, snapshot: StoredSnapshot): void {
  state.snapshot = snapshot;
  for (const listener of Array.from(state.listeners)) listener();
}

function generationsOf(storage: object, keys: ReadonlyArray<string>): ReadonlyArray<number> {
  return keys.map((key) => generationOf(storage, key));
}

/*
  Every key in one call. A read never returns the state to `loading`, so the answer on screen stays until the next one lands.

  A read that a later one superseded is dropped, so an answer that has already been overtaken is never shown, and a call the backend never settles cannot hold the keys back: the next change starts a read of its own.
*/
async function read<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  keys: ReadonlyArray<KeyOf<Definition>>,
  state: AsyncValuesState,
  reading: number,
): Promise<void> {
  state.readAt = generationsOf(storage, keys);

  try {
    const values: Readonly<Record<string, unknown>> = await storage.getMany(keys);

    if (state.reading !== reading) return;

    publish(state, { status: "ready", values, error: undefined });
  } catch (cause) {
    if (state.reading !== reading) return;

    publish(state, { status: "failed", values: undefined, error: asStorageError(cause) });
  }
}

/*
  Changes arriving in one turn, such as a `clear` naming every key, start one read rather than one per key.

  The read under way is overtaken as soon as the change arrives, not once the next read starts: its answer may already be waiting to be handled, and showing it would show what the change has replaced.
*/
function schedule<Definition extends StorageSchemaDefinition>(
  storage: PlatformStorage<Definition>,
  keys: ReadonlyArray<KeyOf<Definition>>,
  state: AsyncValuesState,
): void {
  if (state.queued) return;

  state.queued = true;
  state.reading += 1;
  const reading = state.reading;

  /* A resolved promise rather than `queueMicrotask`, which a React Native application compiles without. */
  void Promise.resolve().then(() => {
    state.queued = false;

    return read(storage, keys, state, reading);
  });
}

function movedSince(
  storage: object,
  keys: ReadonlyArray<string>,
  state: AsyncValuesState,
): boolean {
  const { readAt } = state;

  return (
    readAt === undefined || keys.some((key, index) => generationOf(storage, key) !== readAt[index])
  );
}

/**
 * What these keys read as right now, or that they have not answered yet. Stable until the answer changes.
 *
 * The one narrowing in this module: a state holds what the read produced for its keys, and only the caller knows which schema they belong to. The values were read from those keys, so the pairing holds.
 */
export function getAsyncValuesSnapshot<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: PlatformStorage<Definition>,
  keys: ReadonlyArray<Key>,
): AsyncStoredValues<Definition, Key> {
  return stateFor(storage, keys).snapshot as AsyncStoredValues<Definition, Key>;
}

/** Before anything has been read, which is all a server can say about a backend it cannot reach. */
export function getAsyncValuesServerSnapshot(): typeof LOADING {
  return LOADING;
}

/**
 * Watches several keys, reading all of them once someone is listening and again whenever one changes.
 *
 * The first listener starts the read and begins following the keys; the last one to leave stops again, so a list nothing displays costs nothing.
 */
export function subscribeToAsyncValues<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: PlatformStorage<Definition>,
  keys: ReadonlyArray<Key>,
  listener: () => void,
): () => void {
  const unique = uniqueKeys(keys);
  const state = stateFor(storage, unique);
  state.listeners.add(listener);

  if (state.unwatch === undefined) {
    state.unwatch = subscribeToKeys(storage, unique, () => {
      schedule(storage, unique, state);
    });

    /* Read now if nothing has, and read again if a key moved while nobody was watching. */
    if (movedSince(storage, unique, state)) schedule(storage, unique, state);
  }

  return () => {
    state.listeners.delete(listener);

    if (state.listeners.size > 0) return;

    state.unwatch?.();
    state.unwatch = undefined;
  };
}
