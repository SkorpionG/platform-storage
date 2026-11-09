import { StorageSchemaError } from "../errors/errors";
import type { StandardSchemaV1 } from "../types/standard-schema";
import type { KeyDefinition, KeyOf, KeyOptions } from "./key-definition";
import { SCHEMA_BRAND } from "./storage-schema";
import type { StorageSchema, StorageSchemaDefinition } from "./storage-schema";

/**
 * The shape each entry must have once its own schema is known.
 *
 * `KeyDefinition` alone cannot express this: it has to accept any schema, so its `default` is only as narrow as `unknown`. Re-checking the inferred definition against this is what turns a default that the schema would reject into a compile error at the entry that declares it.
 *
 * `default` is compared against a deeply readonly view of the output because the `const` type parameter below infers array and object literals as readonly.
 *
 * An `onInvalid` callback's return type is deliberately left unchecked here. Inferring this object and constraining it against a type derived from itself means a callback written inline gets no usable expectation to meet, so its literal return widens to `string` and a narrower rule would reject values the schema plainly allows. Declare such a key with `defineKey(schema, options)`, where the schema is known before the options are read, to have the callback checked.
 */
export type ValidateDefinition<Definition> = {
  readonly [Key in keyof Definition]: Definition[Key] extends {
    readonly schema: infer Schema extends StandardSchemaV1;
  }
    ? { readonly schema: Schema } & KeyOptions<Schema, unknown>
    : KeyDefinition;
};

/** Standard Schema marks its validators with `~standard`; anything else cannot be validated against. */
function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  if (!("~standard" in value)) return false;

  const standard: unknown = value["~standard"];

  return (
    typeof standard === "object" &&
    standard !== null &&
    "version" in standard &&
    standard.version === 1
  );
}

/*
  A second pass, because an old name has to be compared against every current name, including those of keys declared after it.

  An old name that is another key's current name would have one key's read adopt and delete the other's value. Two keys claiming one old name would race for it, with whichever read came first taking the value.
*/
function checkOldNames(
  keys: ReadonlyArray<string>,
  definition: StorageSchemaDefinition,
  currentOwners: ReadonlyMap<string, string>,
): void {
  const claimants = new Map<string, string>();

  for (const key of keys) {
    const { readFrom } = definition[key] as KeyDefinition;

    if (readFrom === undefined) continue;

    if (!Array.isArray(readFrom)) {
      throw new StorageSchemaError(
        `The "${key}" entry's \`readFrom\` is not an array. List the names it used to be stored under, even if there is only one.`,
      );
    }

    for (const oldName of readFrom as ReadonlyArray<string>) {
      const owner = currentOwners.get(oldName);

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
 * Declares what a storage holds.
 *
 * Keys and value types both come from this one object, so nothing has to be restated: the editor completes the keys, `get` returns the schema's output, and `set` refuses anything else.
 *
 * @param definition - Each logical key mapped to its definition: a `schema`, and optionally `key`, `readFrom`, `default` and `onInvalid`. Use {@link defineKey} for a key whose `onInvalid` is a callback.
 * @returns A frozen, checked schema to hand to a storage factory.
 * @throws {StorageSchemaError} If an entry has no Standard Schema validator, `readFrom` is not an array or names a current stored name, or two keys resolve to the same physical key or claim the same old one.
 * @example
 * ```ts
 * const schema = defineStorageSchema({
 *   theme: { schema: z.enum(["light", "dark"]), default: "light" },
 *   user: { schema: userSchema, key: "app:user" },
 * });
 * ```
 */
export function defineStorageSchema<
  const Definition extends StorageSchemaDefinition & ValidateDefinition<Definition>,
>(definition: Definition): StorageSchema<Definition> {
  const keys = Object.keys(definition) as Array<KeyOf<Definition>>;
  const physicalKeys: Record<string, string> = {};
  const owners = new Map<string, string>();

  for (const key of keys) {
    const entry: KeyDefinition = definition[key];

    if (!isStandardSchema(entry.schema)) {
      throw new StorageSchemaError(
        `The "${key}" entry has no Standard Schema validator. Give it a \`schema\` from Zod, Valibot, ArkType, or any library implementing the Standard Schema specification.`,
      );
    }

    const physicalKey = entry.key ?? key;
    const owner = owners.get(physicalKey);

    if (owner !== undefined) {
      throw new StorageSchemaError(
        `"${owner}" and "${key}" both store under "${physicalKey}". Two keys writing to one place would overwrite each other.`,
      );
    }

    owners.set(physicalKey, key);
    physicalKeys[key] = physicalKey;
  }

  checkOldNames(keys, definition, owners);

  return Object.freeze({
    [SCHEMA_BRAND]: Object.freeze({ kind: "schema", version: 1 }),
    definition,
    keys: Object.freeze(keys),
    physicalKeys: Object.freeze(physicalKeys),
  }) as StorageSchema<Definition>;
}
