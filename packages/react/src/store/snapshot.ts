import type {
  GetResult,
  KeyOf,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/core";

import { generationOf } from "./changes";

interface CachedRead {
  readonly generation: number;
  readonly value: unknown;
}

/*
  `useSyncExternalStore` compares snapshots by identity and keeps re-reading until two agree, so a snapshot that builds a fresh value on every call never settles and React ends the render with `Maximum update depth exceeded`. A read does build one: `getSync` deserializes on every call, and a schema default built by a factory answers with a new object even for a key holding nothing.

  Keying the cache on the key's generation makes a read stable for exactly as long as nothing has written to it, which is the same window in which the value cannot have changed.

  The cast below is because a `WeakMap` cannot carry the type parameter its key was built from. Every entry is written by the same read that later returns it, so the pairing holds.
*/
const reads = new WeakMap<object, Map<string, CachedRead>>();

export function cachedRead<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: SyncPlatformStorage<Definition>,
  key: Key,
  generation: number,
): GetResult<Definition[Key]> {
  const existing = reads.get(storage);
  const byKey = existing ?? new Map<string, CachedRead>();

  if (existing === undefined) reads.set(storage, byKey);

  const cached = byKey.get(key);

  if (cached !== undefined && cached.generation === generation) {
    return cached.value as GetResult<Definition[Key]>;
  }

  const value = storage.getSync(key);
  byKey.set(key, { generation, value });

  return value;
}

/** What the key holds now, stable until something writes to it. */
export function readStorageValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: SyncPlatformStorage<Definition>, key: Key): GetResult<Definition[Key]> {
  return cachedRead(storage, key, generationOf(storage, key));
}
