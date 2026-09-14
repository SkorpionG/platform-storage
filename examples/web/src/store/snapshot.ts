import { createStorage, memoryAdapter } from "@platform-storage/web";
import type {
  GetResult,
  KeyOf,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/web";

import { getRevision, HYDRATION_REVISION } from "./revision";

interface CachedRead {
  readonly revision: number;
  readonly value: unknown;
}

/*
  `useSyncExternalStore` compares snapshots by identity and keeps re-reading until two agree, so a snapshot that builds a fresh value on every call never settles. Two keys in this schema do exactly that: `user` is parsed out of text on each read, and `recentSearches` takes its default from a schema factory that answers with a new array, on the missing path as well as the stored one. Keying the cache on the revision counter makes a read stable for precisely as long as nothing has written, which is the same window in which the value cannot have changed.
*/
const reads = new WeakMap<object, Map<string, CachedRead>>();

function cachedRead<Definition extends StorageSchemaDefinition, Key extends KeyOf<Definition>>(
  storage: SyncPlatformStorage<Definition>,
  key: Key,
  revision: number,
): GetResult<Definition[Key]> {
  let byKey = reads.get(storage);

  if (byKey === undefined) {
    byKey = new Map<string, CachedRead>();
    reads.set(storage, byKey);
  }

  const cached = byKey.get(key);

  if (cached !== undefined && cached.revision === revision) {
    return cached.value as GetResult<Definition[Key]>;
  }

  const value = storage.getSync(key);
  byKey.set(key, { revision, value });

  return value;
}

/*
  A storage over an empty backend, built from the schema of the one it stands in for. Storing it per storage rather than per schema keeps the lookup to an identity the caller already holds; the cast is because a `WeakMap` cannot carry the type parameter its key was built from, and the twin is created from that key's own schema on the line below.
*/
const declaredTwins = new WeakMap<object, unknown>();

function declaredTwin<Definition extends StorageSchemaDefinition>(
  storage: SyncPlatformStorage<Definition>,
): SyncPlatformStorage<Definition> {
  const existing = declaredTwins.get(storage);

  if (existing !== undefined) return existing as SyncPlatformStorage<Definition>;

  const twin = createStorage({ schema: storage.schema, adapter: memoryAdapter() });
  declaredTwins.set(storage, twin);

  return twin;
}

/** What the key holds now. Stable until something writes, which is what makes it usable as a snapshot. */
export function readStored<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: SyncPlatformStorage<Definition>, key: Key): GetResult<Definition[Key]> {
  return cachedRead(storage, key, getRevision());
}

/**
 * What the key reads as with nothing stored at all.
 *
 * This is what a server renders and what the browser's first pass has to agree with, so it comes from a storage over an empty backend rather than from a list of defaults: the schema answers, exactly as it does for a real read, and a default that moves moves here with it.
 */
export function readDeclared<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: SyncPlatformStorage<Definition>, key: Key): GetResult<Definition[Key]> {
  return cachedRead(declaredTwin(storage), key, HYDRATION_REVISION);
}
