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

/**
 * Declares what a storage holds.
 *
 * Keys and value types both come from this one object, so nothing has to be restated: the editor completes the keys, `get` returns the schema's output, and `set` refuses anything else.
 *
 * ```ts
 * const schema = defineStorageSchema({
 *   theme: { schema: z.enum(["light", "dark"]), default: "light" },
 *   user: { schema: userSchema, key: "app:user" },
 * });
 * ```
 *
 * @throws {StorageSchemaError} If an entry has no Standard Schema validator, or two keys resolve to the same physical key.
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

  return Object.freeze({
    [SCHEMA_BRAND]: Object.freeze({ kind: "schema", version: 1 }),
    definition,
    keys: Object.freeze(keys),
    physicalKeys: Object.freeze(physicalKeys),
  }) as StorageSchema<Definition>;
}
