import type { SchemaOutput, StandardSchemaV1 } from "../types/standard-schema";
import type { Immutable } from "../types/utils";
import type { KeyOptions, KeyVersion } from "./key-definition";

/** A key definition holding every shape the key has had, with the latest as its `schema`. */
export interface VersionedKey<Schema extends StandardSchemaV1> {
  /** The latest version, which is what reads answer with and writes accept. */
  readonly schema: Schema;
  /** Every version, oldest first. A version's number is its position, counting from 1. */
  readonly versions: ReadonlyArray<KeyVersion>;
}

/** A versioned key still being declared. It is usable as it stands, and can take another version or its options. */
export interface VersionChain<Schema extends StandardSchemaV1> extends VersionedKey<Schema> {
  /**
   * Adds the next version and the step reaching it from the one before.
   *
   * @param schema - The shape of the new version.
   * @param up - Turns a value of the previous version into this one. Synchronous, because a synchronous read has to be able to run it.
   * @returns A chain ending at the new version. The chain it was called on is unchanged.
   */
  next<Next extends StandardSchemaV1, const Result extends Immutable<SchemaOutput<Next>>>(
    schema: Next,
    up: (previous: SchemaOutput<Schema>) => Result,
  ): VersionChain<Next>;

  /**
   * Finishes the key with its options, every one checked against the latest version.
   *
   * @param options - `key`, `readFrom`, `default`, `onInvalid` and `recover`, as `defineKey` takes them.
   * @returns A key definition to place in `defineStorageSchema`. It has no `next`, so a version cannot be added after options that were checked against the one before it.
   */
  options<const Options extends KeyOptions<Schema>>(
    options: Options,
  ): Options & VersionedKey<Schema>;
}

function chainOf<Schema extends StandardSchemaV1>(
  versions: ReadonlyArray<KeyVersion>,
  schema: Schema,
): VersionChain<Schema> {
  return {
    schema,
    versions,
    next: (nextSchema, up) =>
      chainOf(Object.freeze([...versions, { schema: nextSchema, up }]), nextSchema),
    /*
      The assertion is the spread itself, which TypeScript cannot see produces the intersection.

      Spread first, so an option cannot replace the chain it was checked against.
    */
    options: <const Options extends KeyOptions<Schema>>(options: Options) =>
      ({ ...options, schema, versions }) as Options & VersionedKey<Schema>,
  };
}

/**
 * Declares a key by the shapes it has had, so a value written by an older release is brought forward when it is read.
 *
 * A chain rather than a numbered list, so a missing step cannot be written down and each step is typed against the version before it. Declaring versions is what makes a key store its version beside its value; every other key stays bare.
 *
 * A value stored before the key had versions reads as version 1, so the schema a key already has becomes the first version and no separate migration is needed.
 *
 * @param schema - The first version. For an existing key, the schema it has today.
 * @returns A chain to extend with `next` and finish with `options`, or to place directly in {@link defineStorageSchema}.
 * @example
 * ```ts
 * const user = defineVersions(z.object({ id: z.string() }))
 *   .next(userSchema, (previous) => ({ ...previous, name: "Unknown" }))
 *   .options({ key: "app:user" });
 *
 * const schema = defineStorageSchema({ user });
 * ```
 */
export function defineVersions<Schema extends StandardSchemaV1>(
  schema: Schema,
): VersionChain<Schema> {
  return chainOf(Object.freeze([{ schema }]), schema);
}
