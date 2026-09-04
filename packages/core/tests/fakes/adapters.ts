import {
  defineSyncAdapter,
  jsonSerializer,
  memoryAdapter,
  passthroughSerializer,
} from "../../src/index";
import type {
  JsonValue,
  MemoryStorageAdapter,
  StorageAdapter,
  SyncStorageAdapter,
} from "../../src/index";

/**
 * A backend that only ever answers asynchronously, so a storage built over it has no synchronous half.
 */
export const asyncOnlyAdapter: StorageAdapter<string> = {
  name: "async-only",
  serializer: jsonSerializer,
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

/** A backend that fails every operation in its own vocabulary, as a real one would. */
export function failingAdapter(message: string): StorageAdapter<string> {
  return {
    name: "failing",
    serializer: jsonSerializer,
    get: () => Promise.reject(new Error(message)),
    set: () => Promise.reject(new Error(message)),
    remove: () => Promise.reject(new Error(message)),
  };
}

/** A backend whose probe reports it is not there, for exercising `withFallback`. */
export function unavailableAdapter(name = "unavailable"): MemoryStorageAdapter {
  return { ...memoryAdapter({ name }), isAvailable: () => false };
}

/**
 * A synchronous backend with no presence check.
 *
 * `has` is optional on the adapter contract, so anything built over one has to derive presence from a read instead.
 */
export function adapterWithoutPresenceCheck(name: string): SyncStorageAdapter<string> {
  const entries = new Map<string, string>();

  return defineSyncAdapter({
    name,
    serializer: jsonSerializer,
    getSync: (key) => entries.get(key),
    setSync: (key, value) => {
      entries.set(key, value);
    },
    removeSync: (key) => {
      entries.delete(key);
    },
  });
}

/**
 * A backend that transports JSON values rather than text, as an extension storage area does.
 *
 * The wire it hands back for a stored `null` is `null` itself, which is the case that keeps a stored null distinct from a key holding nothing.
 */
export function jsonValueAdapter(
  initial: Readonly<Record<string, JsonValue>> = {},
): SyncStorageAdapter<JsonValue> {
  const entries = new Map<string, JsonValue>(Object.entries(initial));

  return defineSyncAdapter({
    name: "json-value",
    serializer: passthroughSerializer,
    getSync: (key) => (entries.has(key) ? entries.get(key) : undefined),
    setSync: (key, value) => {
      entries.set(key, value);
    },
    removeSync: (key) => {
      entries.delete(key);
    },
  });
}
