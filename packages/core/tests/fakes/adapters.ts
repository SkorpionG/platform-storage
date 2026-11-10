import {
  defineSyncAdapter,
  jsonSerializer,
  memoryAdapter,
  passthroughSerializer,
} from "../../src/index";
import type {
  AdapterChange,
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

/** A recording backend with a change feed a suite drives by hand. */
export interface FeedAdapter extends RecordingAdapter {
  emit(change: AdapterChange<string>): void;
  readonly connections: () => number;
}

export function feedAdapter(
  initial: Readonly<Record<string, string>> = {},
  reportsOwnWrites = false,
): FeedAdapter {
  const listeners = new Set<(change: AdapterChange<string>) => void>();

  return {
    ...recordingAdapter(initial),
    subscribe: (listener) => {
      listeners.add(listener);

      return {
        stop: () => {
          listeners.delete(listener);
        },
        reportsOwnWrites,
      };
    },
    emit: (change) => {
      for (const listener of listeners) listener(change);
    },
    connections: () => listeners.size,
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

function sortedCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedCopy);
  if (typeof value !== "object" || value === null) return value;

  const fields = Object.entries(value).filter(([, field]) => field !== undefined);

  // oxlint-disable-next-line unicorn/no-array-sort
  fields.sort(([left], [right]) => (left < right ? -1 : 1));

  return Object.fromEntries(fields.map(([key, field]) => [key, sortedCopy(field)]));
}

/** A backend behaving like an extension area: it answers later, drops `undefined`, sorts object keys, hands back a fresh copy on every read, and reports its own writes. */
export interface AreaAdapter extends StorageAdapter<JsonValue> {
  peek(key: string): unknown;
}

export function areaAdapter(initial: Readonly<Record<string, JsonValue>> = {}): AreaAdapter {
  const entries = new Map<string, unknown>(
    Object.entries(initial).map(([key, value]) => [key, sortedCopy(value)]),
  );
  const listeners = new Set<(change: AdapterChange<JsonValue>) => void>();

  return {
    name: "area",
    serializer: passthroughSerializer,
    peek: (key) => sortedCopy(entries.get(key)),
    get: (key) => Promise.resolve(sortedCopy(entries.get(key)) as JsonValue | undefined),
    set: (key, value) => {
      const oldValue = entries.get(key) as JsonValue | undefined;
      const newValue = sortedCopy(value) as JsonValue;

      entries.set(key, newValue);

      for (const listener of listeners) listener({ key, oldValue, newValue });

      return Promise.resolve();
    },
    remove: (key) => {
      entries.delete(key);

      return Promise.resolve();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return {
        stop: () => {
          listeners.delete(listener);
        },
        reportsOwnWrites: true,
      };
    },
  };
}

/** An asynchronous backend with batch methods, recording every call it receives, with an optional pause placed after a call has done its work. */
export interface BatchingAdapter extends StorageAdapter<string> {
  readonly entries: Map<string, string>;
  readonly calls: Array<string>;
}

export function batchingAdapter(
  initial: Readonly<Record<string, string>> = {},
  pauseAfter: (call: string) => Promise<void> | undefined = () => undefined,
): BatchingAdapter {
  const recording = recordingAdapter(initial, pauseAfter);
  const { entries, calls } = recording;

  const record = async <Value>(call: string, work: () => Value): Promise<Value> => {
    calls.push(call);
    const result = work();
    await pauseAfter(call);

    return result;
  };

  return {
    ...recording,
    getMany: (keys) =>
      record(`getMany ${keys.join(",")}`, () => {
        const found = new Map<string, string>();

        for (const key of keys) {
          const value = entries.get(key);

          if (value !== undefined) found.set(key, value);
        }

        return found;
      }),
    setMany: (items) =>
      record(`setMany ${[...items.keys()].join(",")}`, () => {
        for (const [key, value] of items) entries.set(key, value);
      }),
    removeMany: (keys) =>
      record(`removeMany ${keys.join(",")}`, () => {
        for (const key of keys) entries.delete(key);
      }),
  };
}
