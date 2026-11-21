import { createStorage, jsonSerializer, memoryAdapter } from "@platform-storage/core";
import type { PlatformStorage, StorageAdapter, SyncPlatformStorage } from "@platform-storage/core";

import { testSchema } from "./schema";
import type { TestDefinition } from "./schema";

/** A storage that answers immediately, standing in for web storage. */
export function syncStorage(): SyncPlatformStorage<TestDefinition> {
  return createStorage({ schema: testSchema, adapter: memoryAdapter() });
}

/**
 * A backend that only ever answers later, so a storage over it has no synchronous half at all.
 *
 * Holds its values, unlike a stub that always resolves with nothing, because the asynchronous tests have to watch a written value come back.
 */
function asyncOnlyAdapter(delay = 0): StorageAdapter<string> {
  const entries = new Map<string, string>();

  const settle = <Value>(value: Value): Promise<Value> =>
    delay === 0
      ? Promise.resolve(value)
      : new Promise((resolve) => {
          setTimeout(() => resolve(value), delay);
        });

  return {
    name: "async-only",
    serializer: jsonSerializer,
    get: (key) => settle(entries.get(key)),
    set: (key, value) => settle(entries.set(key, value)).then(() => undefined),
    remove: (key) => settle(entries.delete(key)).then(() => undefined),
  };
}

/** A storage with no synchronous half, standing in for an extension area or AsyncStorage. */
export function asyncStorage(delay = 0): PlatformStorage<TestDefinition> {
  return createStorage({ schema: testSchema, adapter: asyncOnlyAdapter(delay) });
}

/** A backend that refuses every operation in its own vocabulary, as a real one does when a permission is missing. */
export function failingStorage(message = "refused"): PlatformStorage<TestDefinition> {
  const adapter: StorageAdapter<string> = {
    name: "failing",
    serializer: jsonSerializer,
    get: () => Promise.reject(new Error(message)),
    set: () => Promise.reject(new Error(message)),
    remove: () => Promise.reject(new Error(message)),
  };

  return createStorage({ schema: testSchema, adapter });
}

/**
 * The same storage with nothing to follow, standing in for a hand-written one that offers no `onChange`, so the hooks' own announcements are all that reach a reader.
 *
 * The cast keeps the storage's own type: the hooks accept such a stand-in at runtime, and the tests need its keys typed to call them.
 */
export function unfollowable<Storage extends PlatformStorage<TestDefinition>>(
  storage: Storage,
): Storage {
  return { ...storage, onChange: undefined } as unknown as Storage;
}
