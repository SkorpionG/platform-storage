import {
  isPlatformStorageError,
  PlatformStorageError,
  STORAGE_ERROR_CODE,
} from "@platform-storage/core";

/** A rejection as one of this library's errors, so a component always has a `code` to read. */
export function asStorageError(cause: unknown): PlatformStorageError {
  /* The engine names the adapter and the operation for whatever a backend throws, so a rejection arriving here is already one of this library's errors. The other branch guards a broken contract rather than a reachable path, and keeps the reported type honest if one ever arrives. */
  if (isPlatformStorageError(cause)) return cause;

  return new PlatformStorageError(
    STORAGE_ERROR_CODE.Adapter,
    cause instanceof Error ? cause.message : "The storage failed for an unknown reason.",
    { cause },
  );
}
