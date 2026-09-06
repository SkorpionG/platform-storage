import type { AsyncStorageLike } from "../../src/types";

export interface FakeAsyncStorage extends AsyncStorageLike {
  /** What the storage is holding, for a test to assert against without going back through a storage. */
  readonly entries: ReadonlyMap<string, string>;
}

/**
 * An in-memory AsyncStorage. Returns `null` for a missing key, as the real one does, so suites exercise the mapping from `null` to a missing value.
 */
export function fakeAsyncStorage(initial: Readonly<Record<string, string>> = {}): FakeAsyncStorage {
  const entries = new Map<string, string>(Object.entries(initial));

  return {
    entries,
    getItem: (key) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key, value) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

/** A storage that rejects every call in its own vocabulary, as the native module does when the device's storage fails. */
export function rejectingAsyncStorage(message: string): AsyncStorageLike {
  return {
    getItem: () => Promise.reject(new Error(message)),
    setItem: () => Promise.reject(new Error(message)),
    removeItem: () => Promise.reject(new Error(message)),
  };
}
