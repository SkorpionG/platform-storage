import { STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../errors/codes";
import {
  StorageMigrationError,
  StorageSchemaError,
  StorageSerializationError,
  StorageValidationError,
  UnknownStorageVersionError,
} from "../errors/errors";
import type { KeyDefinition, KeyVersion } from "../schema/key-definition";
import type { Serializer } from "../serializer/serializer";
import type { SchemaIssue, StandardSchemaV1 } from "../types/standard-schema";
import type { MaybePromise } from "../types/utils";
import { copyValue } from "./copy-value";
import { unwrapStored, wrapEnvelope } from "./envelope";
import { chain, discardPromise, isPromiseLike } from "./maybe-promise";

/** Whether the caller can wait. The synchronous path refuses anything that would force it to. */
export type ExecutionMode = "sync" | "async";

/** Everything one key needs, resolved once per operation. */
export interface EntryContext {
  readonly key: string;
  readonly physicalKey: string;
  /** The names this key used to be stored under, in the order a read tries them, prefixed as the storage stores them. */
  readonly oldNames: ReadonlyArray<string>;
  readonly definition: KeyDefinition;
  readonly serializer: Serializer<unknown>;
}

/** What reading the wire produced: nothing stored, a value, or a failure. */
type DeserializeResult =
  | { readonly kind: "missing" }
  | { readonly kind: "deserialized"; readonly value: unknown }
  | { readonly kind: "invalid"; readonly error: StorageSerializationError };

/**
 * Turns what a backend returned into a value, or into the reason it could not be one.
 *
 * A backend that has nothing reports `undefined`, never `null`: a schema may legitimately store `null`, so the two cannot share a meaning.
 */
function deserializeWire(entry: EntryContext, wire: unknown): DeserializeResult {
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

/** What converting a value for the backend produced. */
export type SerializeResult =
  | { readonly kind: "serialized"; readonly wire: unknown }
  | { readonly kind: "invalid"; readonly error: StorageSerializationError };

/**
 * Turns a value into the form its backend stores.
 *
 * Reports the failure rather than throwing it, so both directions of the pipeline answer the same way and the caller has one place to decide what a failure means.
 */
export function serializeValue(entry: EntryContext, value: unknown): SerializeResult {
  const { versions } = entry.definition;

  try {
    return {
      kind: "serialized",
      wire: entry.serializer.serialize(
        versions === undefined ? value : wrapEnvelope(versions.length, value),
      ),
    };
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

/** What checking a value against its schema produced. */
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

/** A stored value that could not be turned into one the schema accepts. */
interface InvalidDecode {
  readonly kind: "invalid";
  readonly error: StorageValidationError | StorageSerializationError | StorageMigrationError;
  readonly issues: ReadonlyArray<SchemaIssue>;
  readonly raw: unknown;
}

/** A stored value claiming a version this code has never heard of. */
interface NewerDecode {
  readonly kind: "newer";
  readonly error: UnknownStorageVersionError;
  readonly issues: ReadonlyArray<SchemaIssue>;
  readonly raw: unknown;
}

/**
 * What a stored value came to once it had been deserialized and validated.
 *
 * `behind` says the value had to be brought forward from an older version, which is what tells a read the stored form is out of date.
 */
export type DecodeResult =
  | { readonly kind: "missing" }
  | { readonly kind: "valid"; readonly value: unknown; readonly behind: boolean }
  | InvalidDecode
  | NewerDecode;

function rejected(
  entry: EntryContext,
  issues: ReadonlyArray<SchemaIssue>,
  raw: unknown,
): InvalidDecode {
  return {
    kind: "invalid",
    error: new StorageValidationError({
      key: entry.key,
      physicalKey: entry.physicalKey,
      operation: STORAGE_OPERATION.Get,
      issues,
      raw,
    }),
    issues,
    raw,
  };
}

/* The error keeps what the step was given, which is what explains the failure. The result keeps what was stored, which is what a repair has to start from. */
function failedStep(
  entry: EntryContext,
  fromVersion: number,
  given: unknown,
  stored: unknown,
  reason: { readonly issues?: ReadonlyArray<SchemaIssue>; readonly cause?: unknown },
): InvalidDecode {
  const error = new StorageMigrationError({
    key: entry.key,
    physicalKey: entry.physicalKey,
    fromVersion,
    toVersion: fromVersion + 1,
    raw: given,
    ...reason,
  });

  return {
    kind: "invalid",
    error,
    issues: reason.issues ?? [{ message: error.message }],
    raw: stored,
  };
}

/* One step at a time, each result validated before the next step sees it, so a failure names the step at fault and no step is handed something its types do not promise. */
function bringForward(
  entry: EntryContext,
  versions: ReadonlyArray<KeyVersion>,
  version: number,
  value: unknown,
  stored: unknown,
  mode: ExecutionMode,
): MaybePromise<DecodeResult> {
  if (version === versions.length) return { kind: "valid", value, behind: true };

  /* The declaration check guarantees every version past the first has a step, and `version` counts from 1, so this is the one after it. */
  const { schema, up } = versions[version] as KeyVersion & {
    readonly up: (previous: never) => unknown;
  };

  let next: unknown;

  try {
    /* A copy, because a validator may answer with a default it shares between calls. */
    next = up(copyValue(value) as never);
  } catch (cause) {
    return failedStep(entry, version, value, stored, { cause });
  }

  if (isPromiseLike(next)) {
    discardPromise(next);

    return failedStep(entry, version, value, stored, {
      issues: [{ message: "The step returned a promise. A step has to be synchronous." }],
    });
  }

  return chain(validateValue(schema, next, mode), (validated) =>
    validated.kind === "valid"
      ? bringForward(entry, versions, version + 1, validated.value, stored, mode)
      : failedStep(entry, version, value, stored, { issues: validated.issues }),
  );
}

function decodeVersioned(
  entry: EntryContext,
  versions: ReadonlyArray<KeyVersion>,
  stored: unknown,
  mode: ExecutionMode,
): MaybePromise<DecodeResult> {
  const { version, payload } = unwrapStored(stored);
  const latest = versions.length;

  if (version > latest) {
    const error = new UnknownStorageVersionError({
      key: entry.key,
      physicalKey: entry.physicalKey,
      storedVersion: version,
      latestVersion: latest,
      raw: payload,
    });

    return { kind: "newer", error, issues: [{ message: error.message }], raw: payload };
  }

  const { schema } = versions[version - 1] as KeyVersion;

  return chain(validateValue(schema, payload, mode), (validated) => {
    if (validated.kind !== "valid") return rejected(entry, validated.issues, payload);
    if (version === latest) return { kind: "valid", value: validated.value, behind: false };

    return bringForward(entry, versions, version, validated.value, payload, mode);
  });
}

/**
 * Turns what a backend returned into the value a read would answer with, or the reason it cannot.
 *
 * Decides nothing about what a failure means, so everything that reads a stored value can apply a policy of its own.
 */
export function decodeWire(
  entry: EntryContext,
  wire: unknown,
  mode: ExecutionMode,
): MaybePromise<DecodeResult> {
  const deserialized = deserializeWire(entry, wire);

  if (deserialized.kind === "missing") return deserialized;

  if (deserialized.kind === "invalid") {
    const { error } = deserialized;

    return { kind: "invalid", error, issues: [{ message: error.message }], raw: wire };
  }

  const { versions } = entry.definition;

  if (versions !== undefined) return decodeVersioned(entry, versions, deserialized.value, mode);

  return chain(validateValue(entry.definition.schema, deserialized.value, mode), (validated) =>
    validated.kind === "valid"
      ? { kind: "valid", value: validated.value, behind: false }
      : rejected(entry, validated.issues, deserialized.value),
  );
}

/* Sorted, because a backend that transports objects may hand them back with their keys in another order. */
function withSortedKeys(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;

  /* `sort` on a fresh array, because Hermes has no `toSorted`. */
  // oxlint-disable-next-line unicorn/no-array-sort
  const sorted = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1));

  return Object.fromEntries(sorted);
}

/** Whether two values a backend returned are the same stored value. A backend that transports objects hands back a new one on every read. */
export function isSameWire(first: unknown, second: unknown): boolean {
  if (first === second) return true;

  try {
    return JSON.stringify(first, withSortedKeys) === JSON.stringify(second, withSortedKeys);
  } catch {
    return false;
  }
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
