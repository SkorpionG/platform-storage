import type {
  GetManyResult,
  GetResult,
  KeyOf,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/core";

import { generationOf } from "./changes";
import { signatureOf, uniqueKeys } from "./key-list";
import { entriesFor } from "./per-storage";

interface CachedRead {
  readonly generation: number;
  readonly value: unknown;
}

interface CachedReads {
  readonly generations: ReadonlyArray<number>;
  readonly values: Readonly<Record<string, unknown>>;
}

/*
  `useSyncExternalStore` compares snapshots by identity and keeps re-reading until two agree, so a snapshot that builds a fresh value on every call never settles and React ends the render with `Maximum update depth exceeded`. A read does build one: `getSync` deserializes on every call, and a schema default built by a factory answers with a new object even for a key holding nothing.

  Keying the cache on the key's generation makes a read stable for exactly as long as nothing has written to it, which is the same window in which the value cannot have changed.

  The casts below are because a `WeakMap` cannot carry the type parameter its key was built from. Every entry is written by the same read that later returns it, so the pairing holds.

  The last cast in `cachedReads` is because `Object.fromEntries` answers with a record of `string` whatever keys it was built from. It is built from exactly the keys asked for, each with its own read, which is what `GetManyResult` describes.
*/
const reads = new WeakMap<object, Map<string, CachedRead>>();

/* Several keys' answer as one object, kept per list so that it holds its identity as a whole until one of its keys moves. */
const readsOfLists = new WeakMap<object, Map<string, CachedReads>>();

function isCurrent(storage: object, key: string, generation: number): boolean {
  return entriesFor(reads, storage).get(key)?.generation === generation;
}

/** A read of one key that keeps its identity until that key's generation moves. */
export function cachedRead<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: SyncPlatformStorage<Definition>,
  key: Key,
  generation: number,
): GetResult<Definition[Key]> {
  const byKey = entriesFor(reads, storage);
  const cached = byKey.get(key);

  if (cached !== undefined && cached.generation === generation) {
    return cached.value as GetResult<Definition[Key]>;
  }

  const value = storage.getSync(key);
  byKey.set(key, { generation, value });

  return value;
}

/**
 * Several keys' answer as one object, holding its identity until one of them moves.
 *
 * Only the keys whose generation moved are read. Several that moved together, as after a change naming no key, go in one `getManySync` call, so a backend with a batch call is reached once; while a hook is mounted, React reads the snapshot after each key's announcement, so a write to several keys arrives one key at a time. Each answer goes into the same per-key cache {@link cachedRead} uses, so a key a single-key hook also shows is read once and keeps one identity for both.
 */
export function cachedReads<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: SyncPlatformStorage<Definition>,
  keys: ReadonlyArray<Key>,
  generationFor: (key: Key) => number,
): GetManyResult<Definition, Key> {
  const unique = uniqueKeys(keys);
  const wanted = unique.map((key) => ({ key, generation: generationFor(key) }));
  const byList = entriesFor(readsOfLists, storage);
  const signature = signatureOf(unique);
  const cached = byList.get(signature);

  if (
    cached !== undefined &&
    wanted.every(({ generation }, index) => cached.generations[index] === generation)
  ) {
    return cached.values as GetManyResult<Definition, Key>;
  }

  const stale = wanted.filter(({ key, generation }) => !isCurrent(storage, key, generation));

  if (stale.length > 1) {
    const found: Readonly<Record<string, unknown>> = storage.getManySync(
      stale.map(({ key }) => key),
    );
    const byKey = entriesFor(reads, storage);

    for (const { key, generation } of stale) byKey.set(key, { generation, value: found[key] });
  }

  const values = Object.fromEntries(
    wanted.map(({ key, generation }) => [key, cachedRead(storage, key, generation)]),
  );

  byList.set(signature, { generations: wanted.map(({ generation }) => generation), values });

  return values as GetManyResult<Definition, Key>;
}

/** What the key holds now, stable until something writes to it. */
export function readStorageValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: SyncPlatformStorage<Definition>, key: Key): GetResult<Definition[Key]> {
  return cachedRead(storage, key, generationOf(storage, key));
}

/** What several keys hold now, as one object that is stable until one of them is written to. */
export function readStorageValues<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(
  storage: SyncPlatformStorage<Definition>,
  keys: ReadonlyArray<Key>,
): GetManyResult<Definition, Key> {
  return cachedReads(storage, keys, (key) => generationOf(storage, key));
}
