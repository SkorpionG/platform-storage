import type { AsyncStorageLike } from "../../src/types";

export interface FakeAsyncStorage extends AsyncStorageLike {
  readonly entries: ReadonlyMap<string, string>;
}

/**
 * An in-memory AsyncStorage. Returns `null` for a missing key, as the real one does, so suites exercise the mapping from `null` to a missing value.
 */
export function fakeAsyncStorage(initial: Record<string, string> = {}): FakeAsyncStorage {
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
