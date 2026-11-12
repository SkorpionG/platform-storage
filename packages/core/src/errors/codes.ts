/**
 * Every failure this library reports, as a stable string.
 *
 * The code is what consumers should branch on rather than the class, because a project that ends up with two copies of this package has two copies of each class and `instanceof` quietly stops matching across them.
 */
export const STORAGE_ERROR_CODE = {
  Validation: "VALIDATION",
  Serialization: "SERIALIZATION",
  Adapter: "ADAPTER",
  Quota: "QUOTA",
  Unavailable: "UNAVAILABLE",
  UnknownKey: "UNKNOWN_KEY",
  InvalidSchema: "INVALID_SCHEMA",
  AsyncValidatorInSyncMode: "ASYNC_VALIDATOR_IN_SYNC_MODE",
  Migration: "MIGRATION",
  UnknownVersion: "UNKNOWN_VERSION",
  Unsupported: "UNSUPPORTED",
} as const;

/** Any one of the codes in {@link STORAGE_ERROR_CODE}. */
export type StorageErrorCode = (typeof STORAGE_ERROR_CODE)[keyof typeof STORAGE_ERROR_CODE];

/**
 * Every operation a storage or an adapter can perform.
 *
 * This is the single source for operation names: errors report one, and the API surface is checked against it. A type test asserts that the adapter contract and the storage interface expose exactly these, so adding an operation without naming it here fails the build rather than producing an error that reports an operation nothing else knows about.
 *
 * `Clear` names the method rather than a call any adapter receives, so a refusal reports what the backend refused instead: `RemoveMany`, naming no key, where it took the names in one call, or `Remove` and the name where it went one at a time. `Update` is a method in the same way, reporting the `Get` or `Set` it was carrying out when it failed.
 *
 * `Keys` and `Subscribe` are the reverse: an adapter can answer them and a storage has no such method. A schema already says which keys it declares, and a storage exposes `watch` and `onChange` rather than a backend's raw feed.
 *
 * A `clear` that reaches past the schema calls `Keys` itself, so a backend failing to list its names reports `Keys`, and one that cannot list them at all reports `Clear`.
 */
export const STORAGE_OPERATION = {
  Get: "get",
  Set: "set",
  Remove: "remove",
  Has: "has",
  Clear: "clear",
  Update: "update",
  GetMany: "getMany",
  SetMany: "setMany",
  RemoveMany: "removeMany",
  Keys: "keys",
  Subscribe: "subscribe",
} as const;

/** Any one of the operations in {@link STORAGE_OPERATION}. */
export type StorageOperation = (typeof STORAGE_OPERATION)[keyof typeof STORAGE_OPERATION];

/**
 * The operations that carry a value, and so are the only ones that can fail validation.
 *
 * Derived rather than written out, so it cannot name an operation that no longer exists.
 */
export type ValueOperation = Extract<StorageOperation, "get" | "set">;

/** The property that marks an error as this library's, readable across duplicate copies of the package. */
export const ERROR_BRAND = "~platformStorageError";
