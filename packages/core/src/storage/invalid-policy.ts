import { StorageSchemaError } from "../errors/errors";
import type { StorageSerializationError, StorageValidationError } from "../errors/errors";
import type { SchemaIssue } from "../types/standard-schema";
import type { MaybePromise } from "../types/utils";
import { chain } from "./maybe-promise";

/**
 * What a read does when the stored value does not match its schema.
 *
 * - `"throw"` rejects with the validation error.
 * - `"fallback"` returns the declared default, then the schema's own default, then `undefined`, and leaves the stored value where it is rather than destroying data it could not read.
 * - `"remove"` deletes the stored value first, then resolves as `"fallback"` does.
 */
export const INVALID_POLICY = {
  Throw: "throw",
  Fallback: "fallback",
  Remove: "remove",
} as const;

export type InvalidPolicy = (typeof INVALID_POLICY)[keyof typeof INVALID_POLICY];

/** Everything known about a value that failed to load, handed to an `onInvalid` callback. */
export interface InvalidContext {
  /** The logical key, as declared in the schema. */
  readonly key: string;
  /** The key the backend actually stores under. */
  readonly physicalKey: string;
  /** The value exactly as the backend returned it, before validation. */
  readonly raw: unknown;
  /** Why it failed. Wire data that could not even be deserialized reports a single issue. */
  readonly issues: ReadonlyArray<SchemaIssue>;
  readonly error: StorageValidationError | StorageSerializationError;
}

/** Returns the value to use in place of the invalid one. Synchronous, so it can serve a synchronous read too. */
export type OnInvalidCallback<Value> = (context: InvalidContext) => Value;

export type OnInvalid<Value> = InvalidPolicy | OnInvalidCallback<Value>;

/**
 * The policy applied when nothing else specifies one.
 *
 * Falling back rather than throwing matches how persisted data actually behaves: it outlives the code that wrote it, and a value left over from an older version should not break the app that reads it. It is not silent, because the storage-level `onError` observer still sees every failure. Use `"throw"` in tests and development.
 */
export const DEFAULT_INVALID_POLICY: InvalidPolicy = INVALID_POLICY.Fallback;

/**
 * Picks the policy that governs one read.
 *
 * Narrowest wins: what this call asked for, then what the key declares, then what the storage was built with, then the built-in default.
 */
export function resolveOnInvalid(
  perCall: OnInvalid<unknown> | undefined,
  perKey: OnInvalid<unknown> | undefined,
  perStorage: OnInvalid<unknown> | undefined,
): OnInvalid<unknown> {
  return perCall ?? perKey ?? perStorage ?? DEFAULT_INVALID_POLICY;
}

/** How a policy reaches the backend and the key's own default. */
export interface InvalidPolicyIo {
  remove(): MaybePromise<void>;
  fallback(): MaybePromise<unknown>;
}

/** Carries out whichever policy governs this read. */
export function applyInvalidPolicy(
  policy: OnInvalid<unknown>,
  context: InvalidContext,
  io: InvalidPolicyIo,
): MaybePromise<unknown> {
  if (typeof policy === "function") return policy(context);

  switch (policy) {
    case INVALID_POLICY.Throw:
      throw context.error;
    case INVALID_POLICY.Remove:
      return chain(io.remove(), () => io.fallback());
    case INVALID_POLICY.Fallback:
      return io.fallback();
    default:
      throw new StorageSchemaError(
        `"${String(policy)}" is not an invalid-data policy. Use ${Object.values(INVALID_POLICY)
          .map((name) => `"${name}"`)
          .join(", ")}, or a function returning a replacement value.`,
      );
  }
}
