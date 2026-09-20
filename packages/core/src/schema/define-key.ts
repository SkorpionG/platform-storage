import type { StandardSchemaV1 } from "../types/standard-schema";
import type { KeyOptions } from "./key-definition";

/**
 * Declares one key, with everything about it checked against its schema.
 *
 * The schema comes first and the options second for a reason that matters: TypeScript reads arguments left to right, so by the time it checks the options it already knows the schema and can hold an `onInvalid` callback to the values that schema produces. Declaring the same key inline inside `defineStorageSchema` checks the `default` but trusts the callback, because there the object and the rule it must satisfy are being worked out from each other at once.
 *
 * Reach for this when a key has an `onInvalid` callback, or when it is worth naming and sharing on its own. A key with only a `default` is fully checked either way, so the inline form is the shorter path.
 *
 * @param schema - Any [Standard Schema](https://standardschema.dev) validator, such as a Zod, Valibot or ArkType schema.
 * @param options - `key` to rename what the backend stores under, `default` for what a read answers with when nothing is stored, and `onInvalid` for this key's own invalid-data policy.
 * @returns A key definition to place in {@link defineStorageSchema}.
 * @example
 * ```ts
 * const theme = defineKey(z.enum(["light", "dark"]), {
 *   default: "light",
 *   onInvalid: (context) => (context.raw === "auto" ? "dark" : "light"),
 * });
 *
 * const schema = defineStorageSchema({ theme });
 * ```
 */
export function defineKey<
  Schema extends StandardSchemaV1,
  const Options extends KeyOptions<Schema>,
>(schema: Schema, options?: Options): Options & { readonly schema: Schema } {
  /*
    No default for `Options`: giving it one stops the options argument from being contextually typed, which is the whole reason this signature is shaped the way it is. Omitting the argument falls back to the constraint, where every option is optional.

    The assertion is the spread itself, which TypeScript cannot see produces the intersection.
  */
  return { ...options, schema } as Options & { readonly schema: Schema };
}
