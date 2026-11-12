import { StorageSchemaError } from "../errors/errors";
import type { KeyDefinition } from "./key-definition";
import type { StorageSchema, StorageSchemaDefinition } from "./storage-schema";

/** The names one key claims: where it stores its value, and the names it used to, in the order a read tries them. */
export interface ClaimedNames {
  readonly current: string;
  readonly old: ReadonlyArray<string>;
}

/** One key's names as a storage stores them, with the two kinds of old name also kept apart, so `clear` can target either. */
export interface StoredNames extends ClaimedNames {
  /** The `readFrom` names, under the prefix where one applies. */
  readonly readFrom: ReadonlyArray<string>;
  /** The current and `readFrom` names as written, from before a prefix. Empty where no prefix applies, whether or not a read tries them. */
  readonly unprefixed: ReadonlyArray<string>;
}

/*
  Checked wherever the names are worked out, because a prefix can create a clash the schema alone cannot see.

  Two keys under one name would overwrite each other. An old name that is another key's current name would have one key's read adopt and delete the other's value. Two keys claiming one old name would race for it, with whichever read came first taking the value.
*/
export function checkStoredNames(
  keys: ReadonlyArray<string>,
  namesOf: (key: string) => ClaimedNames,
): void {
  const owners = new Map<string, string>();

  for (const key of keys) {
    const { current } = namesOf(key);
    const owner = owners.get(current);

    if (owner !== undefined) {
      throw new StorageSchemaError(
        `"${owner}" and "${key}" both store under "${current}". Two keys writing to one place would overwrite each other.`,
      );
    }

    owners.set(current, key);
  }

  const claimants = new Map<string, string>();

  for (const key of keys) {
    for (const oldName of namesOf(key).old) {
      const owner = owners.get(oldName);

      if (owner !== undefined) {
        throw new StorageSchemaError(
          `"${key}" reads from "${oldName}", which is where "${owner}" stores its value. A read would take the value it finds there as an old one and delete it.`,
        );
      }

      const claimant = claimants.get(oldName);

      if (claimant !== undefined && claimant !== key) {
        throw new StorageSchemaError(
          `"${claimant}" and "${key}" both read from "${oldName}". Whichever was read first would take the value from the other.`,
        );
      }

      claimants.set(oldName, key);
    }
  }
}

/**
 * Every key's names as one storage stores them, checked against each other.
 *
 * A key's `readFrom` names take the prefix with it, so each storage looks only inside its own prefix. A key declaring `prefixed: false` keeps all of its names as written.
 *
 * Reading unprefixed names adds each prefixed key's names as written, after the prefixed ones, so a value already under the prefix always wins over one left from before it.
 */
export function resolveStoredNames<Definition extends StorageSchemaDefinition>(
  schema: StorageSchema<Definition>,
  prefix: string | undefined,
  readUnprefixed = false,
): ReadonlyMap<string, StoredNames> {
  const names = new Map<string, StoredNames>();

  for (const key of schema.keys) {
    const { readFrom, prefixed } = schema.definition[key] as KeyDefinition;
    const applies = prefix !== undefined && prefixed !== false;
    const stored = (name: string): string => (applies ? `${prefix}${name}` : name);
    const current = schema.physicalKeys[key];
    const declaredReadFrom = readFrom ?? [];
    const prefixedReadFrom = declaredReadFrom.map(stored);
    const unprefixed = applies ? [current, ...declaredReadFrom] : [];

    names.set(key, {
      current: stored(current),
      old: [...prefixedReadFrom, ...(readUnprefixed ? unprefixed : [])],
      readFrom: prefixedReadFrom,
      unprefixed,
    });
  }

  checkStoredNames(schema.keys, (key) => names.get(key) as StoredNames);

  return names;
}
