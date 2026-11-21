import type { KeyOf, SetManyValues, StorageSchemaDefinition } from "@platform-storage/core";

/** The keys a hook was given, each once and in one order, so two lists naming the same keys are the same list. */
export function uniqueKeys<Key extends string>(keys: ReadonlyArray<Key>): ReadonlyArray<Key> {
  /* `sort` on a fresh array, because Hermes has no `toSorted`. */
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...new Set(keys)].sort((left, right) => (left < right ? -1 : 1));
}

/** One string per set of keys, to cache against. A list written inline is a new array on every render, so a cache keyed on the array itself would never hit. */
export function signatureOf(keys: ReadonlyArray<string>): string {
  return JSON.stringify(uniqueKeys(keys));
}

/**
 * The keys a signature was made from, for a hook that memoizes on the signature alone.
 *
 * The cast is because a signature is a string and cannot carry the type of the keys it encodes. Every signature a hook parses is one it made from its own keys, so the pairing holds.
 */
export function keysOfSignature<Key extends string>(signature: string): ReadonlyArray<Key> {
  return JSON.parse(signature) as ReadonlyArray<Key>;
}

/**
 * The keys a batch write names, so each is announced.
 *
 * The cast is because `Object.keys` answers with `string` whatever the object is typed as. An object written for these keys names only them, and one passed through a variable may carry other declared keys too, which the write stored as well, so announcing each name it holds is right either way.
 */
export function keysWritten<Key extends string>(values: {
  readonly [Each in Key]?: unknown;
}): ReadonlyArray<Key> {
  return Object.keys(values) as Array<Key>;
}

/**
 * A write limited to some keys, as the storage's `setMany` takes it.
 *
 * The cast is because the compiler cannot relate a mapped type over a generic subset of the keys back to the mapped type over all of them, though every property of both is optional. An object naming only some keys is a valid write of all of them, so the pairing holds.
 */
export function asWriteOfAll<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
>(values: Pick<SetManyValues<Definition>, Key>): SetManyValues<Definition> {
  return values as SetManyValues<Definition>;
}
