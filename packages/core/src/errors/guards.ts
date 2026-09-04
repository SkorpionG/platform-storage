import { ERROR_BRAND, STORAGE_ERROR_CODE } from "./codes";
import type { PlatformStorageError, StorageValidationError } from "./errors";

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(STORAGE_ERROR_CODE));

/**
 * Whether a caught value is one of this library's errors.
 *
 * Prefer this to `instanceof`. An application that resolves two copies of this package holds two copies of each class, and `instanceof` then fails for an error thrown by the other copy; the brand this reads is a plain property, so it survives.
 */
export function isPlatformStorageError(value: unknown): value is PlatformStorageError {
  if (typeof value !== "object" || value === null) return false;
  if (!(ERROR_BRAND in value) || value[ERROR_BRAND] !== true) return false;

  return "code" in value && typeof value.code === "string" && KNOWN_CODES.has(value.code);
}

/** Whether a caught value is a validation failure, and so carries `issues` and the value that failed. */
export function isStorageValidationError(value: unknown): value is StorageValidationError {
  return isPlatformStorageError(value) && value.code === STORAGE_ERROR_CODE.Validation;
}
