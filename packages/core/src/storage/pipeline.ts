import { STORAGE_ERROR_CODE } from "../errors/codes";
import { StorageSchemaError, StorageSerializationError } from "../errors/errors";
import type { KeyDefinition } from "../schema/key-definition";
import type { Serializer } from "../serializer/serializer";
import type { SchemaIssue, StandardSchemaV1 } from "../types/standard-schema";
import type { MaybePromise } from "../types/utils";
import { chain, isPromiseLike } from "./maybe-promise";

/** Whether the caller can wait. The synchronous path refuses anything that would force it to. */
export type ExecutionMode = "sync" | "async";

/** Everything one key needs, resolved once per operation. */
export interface EntryContext {
  readonly key: string;
  readonly physicalKey: string;
  readonly definition: KeyDefinition;
  readonly serializer: Serializer<unknown>;
}

export type DeserializeResult =
  | { readonly kind: "missing" }
  | { readonly kind: "deserialized"; readonly value: unknown }
  | { readonly kind: "invalid"; readonly error: StorageSerializationError };

/**
 * Turns what a backend returned into a value, or into the reason it could not be one.
 *
 * A backend that has nothing reports `undefined`, never `null`: a schema may legitimately store `null`, so the two cannot share a meaning.
 */
export function deserializeWire(entry: EntryContext, wire: unknown): DeserializeResult {
  if (wire === undefined) return { kind: "missing" };

  try {
    return { kind: "deserialized", value: entry.serializer.deserialize(wire) };
  } catch (cause) {
    return {
      kind: "invalid",
      error: new StorageSerializationError({
        key: entry.key,
        physicalKey: entry.physicalKey,
        direction: "deserialize",
        raw: wire,
        cause,
      }),
    };
  }
}

export type SerializeResult =
  | { readonly kind: "serialized"; readonly wire: unknown }
  | { readonly kind: "invalid"; readonly error: StorageSerializationError };

/**
 * Turns a value into the form its backend stores.
 *
 * Reports the failure rather than throwing it, so both directions of the pipeline answer the same way and the caller has one place to decide what a failure means.
 */
export function serializeValue(entry: EntryContext, value: unknown): SerializeResult {
  try {
    return { kind: "serialized", wire: entry.serializer.serialize(value) };
  } catch (cause) {
    return {
      kind: "invalid",
      error: new StorageSerializationError({
        key: entry.key,
        physicalKey: entry.physicalKey,
        direction: "serialize",
        raw: value,
        cause,
      }),
    };
  }
}

export type ValidateResult =
  | { readonly kind: "valid"; readonly value: unknown }
  | { readonly kind: "invalid"; readonly issues: ReadonlyArray<SchemaIssue> };

function toValidateResult(result: StandardSchemaV1.Result<unknown>): ValidateResult {
  return result.issues === undefined
    ? { kind: "valid", value: result.value }
    : { kind: "invalid", issues: result.issues };
}

/**
 * Runs a value through its schema.
 *
 * Standard Schema permits a validator to answer asynchronously. On the synchronous path that cannot be honored, and returning the promise as though it were the value would be far worse than refusing, so it is refused with an error naming the cause.
 */
export function validateValue(
  schema: StandardSchemaV1,
  value: unknown,
  mode: ExecutionMode,
): MaybePromise<ValidateResult> {
  const result: MaybePromise<StandardSchemaV1.Result<unknown>> =
    schema["~standard"].validate(value);

  if (!isPromiseLike(result)) return toValidateResult(result);

  if (mode === "sync") {
    throw new StorageSchemaError(
      "This schema validates asynchronously, which a synchronous read cannot wait for. Use the asynchronous methods for this storage, or give the key a validator that answers immediately.",
      STORAGE_ERROR_CODE.AsyncValidatorInSyncMode,
    );
  }

  return Promise.resolve(result).then(toValidateResult);
}

/**
 * What a read returns when the backend holds nothing.
 *
 * A declared default wins. Failing that the schema is asked to validate `undefined`, which is how a schema carrying its own default answers for itself. Failing that too, the value is simply absent.
 *
 * A declared default is returned as it was given rather than copied, matching how a validation library hands back its own object defaults. Where each read should get a fresh object, put the default in the schema as a factory instead.
 */
export function resolveMissing(entry: EntryContext, mode: ExecutionMode): MaybePromise<unknown> {
  if (entry.definition.default !== undefined) return entry.definition.default;

  return chain(validateValue(entry.definition.schema, undefined, mode), (result) =>
    result.kind === "valid" ? result.value : undefined,
  );
}
