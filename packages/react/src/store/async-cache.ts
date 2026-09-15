import {
  isPlatformStorageError,
  PlatformStorageError,
  STORAGE_ERROR_CODE,
} from "@platform-storage/core";
import type { KeyOf, PlatformStorage, StorageSchemaDefinition } from "@platform-storage/core";

import type { AsyncStoredValue } from "../types/hooks";
import { generationOf, subscribeToStorage } from "./changes";

/*
  One object for every key that has not been read yet, so a first snapshot holds its identity across renders.

  Typed as exactly what it is rather than as an `AsyncStoredValue<Definition>`, because the loading member names no schema: it is already assignable to the public type for every key there is, which is one cast fewer.
*/
const LOADING = Object.freeze({
  status: "loading",
  value: undefined,
  error: undefined,
} as const);

/*
  What a state holds between reads. Only the `ready` member differs from the public type, and only in its value, which is why this is the one place a snapshot has to be narrowed on the way out.
*/
type StoredSnapshot =
  | typeof LOADING
  | { readonly status: "ready"; readonly value: unknown; readonly error: undefined }
  | { readonly status: "failed"; readonly value: undefined; readonly error: PlatformStorageError };

interface AsyncState {
  snapshot: StoredSnapshot;
  /** Increments per read, so a result that a later read has superseded can be dropped. */
  reading: number;
  /** The key's generation when the current read started, so a change made while nobody was watching is not missed. */
  readAt: number;
  unwatch: (() => void) | undefined;
  readonly listeners: Set<() => void>;
}

const states = new WeakMap<object, Map<string, AsyncState>>();

function stateFor(storage: object, key: string): AsyncState {
  const existing = states.get(storage);
  const byKey = existing ?? new Map<string, AsyncState>();

  if (existing === undefined) states.set(storage, byKey);

  const state = byKey.get(key);

  if (state !== undefined) return state;

  const created: AsyncState = {
    snapshot: LOADING,
    reading: 0,
    readAt: -1,
    unwatch: undefined,
    listeners: new Set<() => void>(),
  };

  byKey.set(key, created);

  return created;
}

function publish(state: AsyncState, snapshot: StoredSnapshot): void {
  state.snapshot = snapshot;
  for (const listener of Array.from(state.listeners)) listener();
}

/* The engine names the adapter and the operation for whatever a backend throws, so a rejection arriving here is already one of this library's errors. The other branch guards a broken contract rather than a reachable path, and keeps the reported type honest if one ever arrives. */
function asStorageError(cause: unknown): PlatformStorageError {
  if (isPlatformStorageError(cause)) return cause;

  return new PlatformStorageError(
    STORAGE_ERROR_CODE.Adapter,
    cause instanceof Error ? cause.message : "The storage failed for an unknown reason.",
    { cause },
  );
}

/*
  A read never returns the entry to `loading`. The previous answer stays on screen until the next one arrives, so a write does not flash a spinner over a value that is about to be replaced by itself.
*/
async function refresh<Definition extends StorageSchemaDefinition, Key extends KeyOf<Definition>>(
  storage: PlatformStorage<Definition>,
  key: Key,
): Promise<void> {
  const state = stateFor(storage, key);
  state.reading += 1;
  const reading = state.reading;
  state.readAt = generationOf(storage, key);

  try {
    const value = await storage.get(key);

    /* A later read has already started, and its answer is the current one. */
    if (state.reading !== reading) return;

    publish(state, { status: "ready", value, error: undefined });
  } catch (cause) {
    if (state.reading !== reading) return;

    publish(state, { status: "failed", value: undefined, error: asStorageError(cause) });
  }
}

/**
 * What the key reads as right now, or that it has not answered yet. Stable until the answer changes.
 *
 * The one narrowing in this module: a state holds what every key's read produced, and only the caller knows which key it asked about. The value was read from that key in `refresh`, so the pairing holds.
 */
export function getAsyncValueSnapshot<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: PlatformStorage<Definition>, key: Key): AsyncStoredValue<Definition[Key]> {
  return stateFor(storage, key).snapshot as AsyncStoredValue<Definition[Key]>;
}

/** Before anything has been read, which is all a server can say about a backend it cannot reach. */
export function getAsyncValueServerSnapshot(): typeof LOADING {
  return LOADING;
}

/**
 * Watches one key, reading it once someone is listening.
 *
 * The first listener starts the read and begins following the storage's changes; the last one to leave stops again, so a key nothing displays costs nothing.
 */
export function subscribeToAsyncValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: PlatformStorage<Definition>, key: Key, listener: () => void): () => void {
  const state = stateFor(storage, key);
  state.listeners.add(listener);

  if (state.unwatch === undefined) {
    state.unwatch = subscribeToStorage(
      storage,
      () => {
        void refresh(storage, key);
      },
      key,
    );

    /* Read now if nothing has, and read again if the key moved while nobody was watching. */
    if (state.readAt !== generationOf(storage, key)) void refresh(storage, key);
  }

  return () => {
    state.listeners.delete(listener);

    if (state.listeners.size > 0) return;

    state.unwatch?.();
    state.unwatch = undefined;
  };
}
