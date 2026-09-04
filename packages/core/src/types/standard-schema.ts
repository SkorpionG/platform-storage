import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * The value a schema accepts. It differs from the output wherever a schema supplies its own default or coerces, which is what makes `undefined` an acceptable input to `z.default()`, `z.catch()` and `z.optional()`.
 */
export type SchemaInput<Schema extends StandardSchemaV1> = StandardSchemaV1.InferInput<Schema>;

/** The value a schema produces once it has validated. This is what a storage holds and returns. */
export type SchemaOutput<Schema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<Schema>;

/** One reason a value failed validation, in the shape every Standard Schema library reports. */
export type SchemaIssue = StandardSchemaV1.Issue;

export type { StandardSchemaV1 };
