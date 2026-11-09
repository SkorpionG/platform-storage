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

/** An asynchronous backend exposing what it holds and every call it received, with an optional pause placed after a call has done its work. */
export interface RecordingAdapter extends StorageAdapter<string> {
  readonly entries: Map<string, string>;
  readonly calls: Array<string>;
}

export function recordingAdapter(
  initial: Readonly<Record<string, string>> = {},
  pauseAfter: (call: string) => Promise<void> | undefined = () => undefined,
): RecordingAdapter {
  const entries = new Map<string, string>(Object.entries(initial));
  const calls: Array<string> = [];

  const record = async <Value>(call: string, work: () => Value): Promise<Value> => {
    calls.push(call);
    const result = work();
    await pauseAfter(call);

    return result;
  };

  return {
    name: "recording",
    serializer: jsonSerializer,
    entries,
    calls,
    get: (key) => record(`get ${key}`, () => entries.get(key)),
    set: (key, value) =>
      record(`set ${key}`, () => {
        entries.set(key, value);
      }),
    remove: (key) =>
      record(`remove ${key}`, () => {
        entries.delete(key);
      }),
  };
}

/** A promise settled from outside, for holding one step of a race open while another runs. */
export function gate(): { readonly opened: Promise<void>; open(): void } {
  let resolveOpened: (() => void) | undefined;
  const opened = new Promise<void>((resolve) => {
    resolveOpened = resolve;
  });

  return { opened, open: () => resolveOpened?.() };
}

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
