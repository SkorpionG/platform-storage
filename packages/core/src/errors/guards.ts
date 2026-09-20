import { ERROR_BRAND, STORAGE_ERROR_CODE } from "./codes";
import type {
  PlatformStorageError,
  StorageQuotaExceededError,
  StorageValidationError,
} from "./errors";

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(STORAGE_ERROR_CODE));

/**
 * Whether a caught value is one of this library's errors.
 *
 * Prefer this to `instanceof`. An application that resolves two copies of this package holds two copies of each class, and `instanceof` then fails for an error thrown by the other copy; the brand this reads is a plain property, so it survives.
 *
 * @param value - Anything caught.
 * @returns `true` for an error this library raised, narrowing it so `code` is readable.
 * @example
 * ```ts
 * try {
 *   await storage.set("theme", "dark");
 * } catch (error) {
 *   if (isPlatformStorageError(error)) console.error(error.code);
 * }
 * ```
 */
export function isPlatformStorageError(value: unknown): value is PlatformStorageError {
  if (typeof value !== "object" || value === null) return false;
  if (!(ERROR_BRAND in value) || value[ERROR_BRAND] !== true) return false;

  return "code" in value && typeof value.code === "string" && KNOWN_CODES.has(value.code);
}

/**
 * Whether a caught value is a validation failure, and so carries `issues` and the value that failed.
 *
 * @param value - Anything caught.
 * @returns `true` for a `VALIDATION` error, narrowing it so `issues` is readable.
 * @example
 * ```ts
 * if (isStorageValidationError(error)) console.error(error.issues);
 * ```
 */
export function isStorageValidationError(value: unknown): value is StorageValidationError {
  return isPlatformStorageError(value) && value.code === STORAGE_ERROR_CODE.Validation;
}

/**
 * Whether a caught value is a backend that ran out of room.
 *
 * This is the one backend failure worth retrying rather than only reporting: evict something and the same write usually succeeds. Not every platform can tell one apart, so a backend that gives no usable signal reports a plain `StorageAdapterError` instead and this answers `false`.
 *
 * @param value - Anything caught.
 * @returns `true` for a `QUOTA` error.
 * @example
 * ```ts
 * if (isStorageQuotaError(error)) {
 *   await storage.remove("recentSearches");
 * }
 * ```
 */
export function isStorageQuotaError(value: unknown): value is StorageQuotaExceededError {
  return isPlatformStorageError(value) && value.code === STORAGE_ERROR_CODE.Quota;
}
