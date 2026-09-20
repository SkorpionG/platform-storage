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
} as const;

/** Any one of the codes in {@link STORAGE_ERROR_CODE}. */
export type StorageErrorCode = (typeof STORAGE_ERROR_CODE)[keyof typeof STORAGE_ERROR_CODE];

/**
 * Every operation a storage or an adapter can perform.
 *
 * This is the single source for operation names: errors report one, and the API surface is checked against it. A type test asserts that the adapter contract and the storage interface expose exactly these, so adding an operation without naming it here fails the build rather than producing an error that reports an operation nothing else knows about.
 *
 * `Clear` names the method rather than a call any adapter receives. `clear()` removes the declared keys one at a time, so a backend that refuses reports `Remove` and the key it refused, which is the more useful of the two.
 */
export const STORAGE_OPERATION = {
  Get: "get",
  Set: "set",
  Remove: "remove",
  Has: "has",
  Clear: "clear",
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
