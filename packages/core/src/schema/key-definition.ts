import type { OnInvalid } from "../storage/invalid-policy";
import type { SchemaInput, SchemaOutput, StandardSchemaV1 } from "../types/standard-schema";
import type { Immutable } from "../types/utils";

/**
 * One entry in a storage schema: what a key holds, where it is stored, and what to do when either expectation is not met.
 */
export interface KeyDefinition<
  Schema extends StandardSchemaV1 = StandardSchemaV1,
  Result = SchemaOutput<Schema> | undefined,
> {
  /** Any Standard Schema validator: Zod, Valibot, ArkType, or your own. */
  readonly schema: Schema;

  /**
   * The key written to the backend. Defaults to the logical key.
   *
   * Keeping the two separate is what lets the stored name be namespaced, or changed, without touching the name application code reads.
   */
  readonly key?: string | undefined;

  /**
   * The value a read returns when nothing is stored.
   *
   * Declaring one removes `undefined` from the result type. The value is returned as given rather than copied, so it should not be mutated by callers; where each read should get a fresh object, put the default in the schema as a factory instead.
   */
  readonly default?: SchemaOutput<Schema> | undefined;

  /**
   * Overrides the storage-wide policy for this key alone.
   *
   * A policy name is always checked. A callback written inline inside `defineStorageSchema` has its return value trusted rather than checked, because there the definition and the rule it must satisfy are being worked out from each other and the callback gets no usable expectation to meet. Declare the key with `defineKey(schema, options)` to have the callback checked; passing one to a single `get` call is checked too, since nothing is being inferred there.
   */
  readonly onInvalid?: OnInvalid<Result> | undefined;
}

/**
 * Everything a key declares apart from its schema, checked against that schema.
 *
 * One shape serves both places a key can be declared: `defineKey`, which knows the schema and so can hold an `onInvalid` callback to the values it produces, and `defineStorageSchema`, which cannot and leaves `InvalidResult` as `unknown`.
 *
 * `default` is compared against a deeply readonly view of the output, because both declaration sites infer literals with a `const` type parameter and that makes every array and object in a default readonly.
 */
export interface KeyOptions<Schema extends StandardSchemaV1, InvalidResult = SchemaOutput<Schema>> {
  /** The key written to the backend. Defaults to the logical key. */
  readonly key?: string | undefined;
  /** The value a read returns when nothing is stored. Declaring one removes `undefined` from the result type. */
  readonly default?: Immutable<SchemaOutput<Schema>> | undefined;
  /** Overrides the storage-wide invalid-data policy for this key alone. */
  readonly onInvalid?: OnInvalid<InvalidResult> | undefined;
}

/** The logical keys a schema declares. */
export type KeyOf<Definition> = Extract<keyof Definition, string>;

/**
 * What `get` returns for one key.
 *
 * `undefined` is dropped when a read can never produce it: either the definition declares a `default`, or the schema itself accepts `undefined` as input and so answers for a missing value. The second case is what makes `z.default()` and `z.optional()` work without restating anything here.
 *
 * A `z.catch()` schema is not one of those, because its input type is its value type. A catch governs data that is *invalid*, which it absorbs before any policy runs; it says nothing about data that is *absent*. Declare a `default` alongside it to cover both.
 */
export type GetResult<Definition> = Definition extends {
  readonly schema: infer Schema extends StandardSchemaV1;
}
  ? Definition extends { readonly default: infer Default }
    ? undefined extends Default
      ? SchemaOutput<Schema> | undefined
      : SchemaOutput<Schema>
    : undefined extends SchemaInput<Schema>
      ? SchemaOutput<Schema>
      : SchemaOutput<Schema> | undefined
  : never;

/**
 * What `set` accepts for one key.
 *
 * The schema's output type, not its input: storage holds the normalized value, and an input type would silently widen to `unknown` for a schema built with `z.catch()`, which would disable write-time checking exactly where it is most wanted.
 */
export type SetValue<Definition> = Definition extends {
  readonly schema: infer Schema extends StandardSchemaV1;
}
  ? SchemaOutput<Schema>
  : never;
