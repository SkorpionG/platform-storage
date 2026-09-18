import type { SerializationDirection } from "../serializer/serializer";
import type { SchemaIssue } from "../types/standard-schema";
import { ERROR_BRAND, STORAGE_ERROR_CODE } from "./codes";
import type { StorageErrorCode, StorageOperation, ValueOperation } from "./codes";
import { formatIssues } from "./format-issues";

/** Names the key in a message, and the physical key too when the two differ. */
function describeKey(key: string, physicalKey: string): string {
  return key === physicalKey ? `"${key}"` : `"${key}" (${physicalKey})`;
}

/**
 * The base class every error this library throws extends.
 *
 * Classes are the one exception to this codebase's no-classes rule: only a class can be caught by type.
 */
export class PlatformStorageError extends Error {
  /** Set on the instance rather than the prototype, so a structured clone of the error is still recognizable. */
  readonly [ERROR_BRAND]: true = true;
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "PlatformStorageError";
    this.code = code;
  }
}

export interface StorageValidationErrorOptions {
  readonly key: string;
  readonly physicalKey: string;
  readonly operation: ValueOperation;
  readonly issues: ReadonlyArray<SchemaIssue>;
  readonly raw: unknown;
  readonly cause?: unknown;
}

/**
 * A value did not match its schema.
 *
 * On a write this always throws. On a read it is what the `"throw"` invalid-data policy raises, and what every other policy receives as the reason.
 */
export class StorageValidationError extends PlatformStorageError {
  readonly key: string;
  readonly physicalKey: string;
  readonly operation: ValueOperation;
  readonly issues: ReadonlyArray<SchemaIssue>;
  /** The value as it was read or passed in, kept so a caller can recover or report it. */
  readonly raw: unknown;

  constructor(options: StorageValidationErrorOptions) {
    const action = options.operation === "get" ? "read from" : "written to";

    super(
      STORAGE_ERROR_CODE.Validation,
      `The value ${action} ${describeKey(options.key, options.physicalKey)} does not match its schema: ${formatIssues(options.issues)}`,
      { cause: options.cause },
    );

    this.name = "StorageValidationError";
    this.key = options.key;
    this.physicalKey = options.physicalKey;
    this.operation = options.operation;
    this.issues = options.issues;
    this.raw = options.raw;
  }
}

export interface StorageSerializationErrorOptions {
  readonly key: string;
  readonly physicalKey: string;
  readonly direction: SerializationDirection;
  readonly raw: unknown;
  readonly cause?: unknown;
}

/** A value could not be converted to or from the form its backend stores. */
export class StorageSerializationError extends PlatformStorageError {
  readonly key: string;
  readonly physicalKey: string;
  readonly direction: SerializationDirection;
  readonly raw: unknown;

  constructor(options: StorageSerializationErrorOptions) {
    const action =
      options.direction === "serialize"
        ? "Serializing the value for"
        : "Reading the stored value of";

    super(
      STORAGE_ERROR_CODE.Serialization,
      `${action} ${describeKey(options.key, options.physicalKey)} failed.`,
      { cause: options.cause },
    );

    this.name = "StorageSerializationError";
    this.key = options.key;
    this.physicalKey = options.physicalKey;
    this.direction = options.direction;
    this.raw = options.raw;
  }
}

export interface StorageAdapterErrorOptions {
  readonly adapter: string;
  readonly operation: StorageOperation;
  readonly physicalKey?: string | undefined;
  readonly message?: string;
  readonly cause?: unknown;
}

/**
 * The backend itself failed: a revoked permission, a rejected native call, a storage the browser will not write to.
 *
 * A backend that has simply run out of room raises `StorageQuotaExceededError`, which extends this, so catching this one still catches that.
 *
 * This is never subject to the invalid-data policy. A policy decides what a bad *value* means; it cannot decide what a broken backend means.
 */
export class StorageAdapterError extends PlatformStorageError {
  readonly adapter: string;
  readonly operation: StorageOperation;
  readonly physicalKey: string | undefined;

  constructor(
    options: StorageAdapterErrorOptions,
    code: StorageErrorCode = STORAGE_ERROR_CODE.Adapter,
  ) {
    const target = options.physicalKey === undefined ? "" : ` on "${options.physicalKey}"`;

    super(
      code,
      options.message ?? `The ${options.adapter} adapter failed to ${options.operation}${target}.`,
      { cause: options.cause },
    );

    this.name = "StorageAdapterError";
    this.adapter = options.adapter;
    this.operation = options.operation;
    this.physicalKey = options.physicalKey;
  }
}

/**
 * The backend is full: `localStorage` over its origin allowance, a `sync` area over `QUOTA_BYTES`, a device out of space.
 *
 * Separate from a plain `StorageAdapterError` because it is the one backend failure an application can usually act on, by evicting something and writing again. Recognizing it is each adapter's job rather than the engine's, since only the adapter knows how its own platform reports one.
 */
export class StorageQuotaExceededError extends StorageAdapterError {
  constructor(options: StorageAdapterErrorOptions) {
    const target = options.physicalKey === undefined ? "" : ` for "${options.physicalKey}"`;

    super(
      {
        ...options,
        message: options.message ?? `The ${options.adapter} backend is out of room${target}.`,
      },
      STORAGE_ERROR_CODE.Quota,
    );

    this.name = "StorageQuotaExceededError";
  }
}

/**
 * The backend is not there at all: no `window`, a storage the browser refuses to hand over, an extension API missing from this context.
 */
export class StorageUnavailableError extends StorageAdapterError {
  constructor(options: StorageAdapterErrorOptions) {
    super(
      {
        ...options,
        message:
          options.message ?? `The ${options.adapter} adapter is not available in this environment.`,
      },
      STORAGE_ERROR_CODE.Unavailable,
    );

    this.name = "StorageUnavailableError";
  }
}

export interface UnknownStorageKeyErrorOptions {
  readonly key: string;
  readonly knownKeys: ReadonlyArray<string>;
}

/** A key the schema does not declare. Unreachable from typed code, so it means a cast or a JavaScript caller. */
export class UnknownStorageKeyError extends PlatformStorageError {
  readonly key: string;
  readonly knownKeys: ReadonlyArray<string>;

  constructor(options: UnknownStorageKeyErrorOptions) {
    super(
      STORAGE_ERROR_CODE.UnknownKey,
      `"${options.key}" is not declared in this storage schema. Declared keys: ${options.knownKeys.join(", ")}.`,
    );

    this.name = "UnknownStorageKeyError";
    this.key = options.key;
    this.knownKeys = options.knownKeys;
  }
}

/** The schema, or the way it is being used, is wrong rather than any stored value. Always a programming error. */
export class StorageSchemaError extends PlatformStorageError {
  constructor(
    message: string,
    code: StorageErrorCode = STORAGE_ERROR_CODE.InvalidSchema,
    options?: { readonly cause?: unknown },
  ) {
    super(code, message, options);
    this.name = "StorageSchemaError";
  }
}
