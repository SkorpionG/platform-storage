import { createStorage, memoryAdapter } from "@platform-storage/core";
import type {
  GetResult,
  KeyOf,
  PlatformStorage,
  StorageSchema,
  StorageSchemaDefinition,
  SyncPlatformStorage,
} from "@platform-storage/core";

import { cachedRead } from "./snapshot";

/*
  A generation of its own, never zero, so a write in the browser cannot invalidate the values the first client render still has to match. Nothing writes to the twin, so one constant covers its whole life.
*/
const DECLARED_GENERATION = -1;

/*
  A storage over an empty backend, built from the schema of the one it stands in for, and kept per schema rather than per storage: what a key reads as with nothing stored depends on the schema alone, so several storages over one definition share an answer.

  The cast is because a `WeakMap` cannot carry the type parameter its key was built from. Every twin is built from the schema it is stored under, so the pairing holds.
*/
const twins = new WeakMap<object, unknown>();

function declaredTwin<Definition extends StorageSchemaDefinition>(
  schema: StorageSchema<Definition>,
): SyncPlatformStorage<Definition> {
  const existing = twins.get(schema);

  if (existing !== undefined) return existing as SyncPlatformStorage<Definition>;

  const twin = createStorage({ schema, adapter: memoryAdapter() });
  twins.set(schema, twin);

  return twin;
}

/**
 * What a key reads as with nothing stored at all.
 *
 * This is everything a server can honestly answer with, and it is what the browser's first render has to agree with. It comes from a storage over an empty backend rather than from a list of defaults, so the schema answers exactly as it does for a real read and a default that moves moves here with it.
 *
 * Synchronous on every platform, including the ones whose own reads are not: the empty backend is memory, whatever the real storage is.
 *
 * @param storage - Any storage. Only its schema is read; its backend is never touched.
 * @param key - Which key to answer for.
 * @returns The key's declared default, or `undefined` where it has none.
 * @example
 * ```tsx
 * // In a Server Component.
 * const theme = readDeclaredValue(storage, "theme");
 * ```
 */
export function readDeclaredValue<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(storage: PlatformStorage<Definition>, key: Key): GetResult<Definition[Key]> {
  return cachedRead(declaredTwin(storage.schema), key, DECLARED_GENERATION);
}
