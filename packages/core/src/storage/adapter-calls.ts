import type { StorageAdapter } from "../adapter/adapter";
import type { StorageOperation } from "../errors/codes";
import { StorageAdapterError } from "../errors/errors";
import type { PlatformStorageError } from "../errors/errors";
import { isPlatformStorageError } from "../errors/guards";
import type { MaybePromise } from "../types/utils";
import { isPromiseLike } from "./maybe-promise";

/**
 * Runs one backend call, turning whatever it throws into a `StorageAdapterError`.
 *
 * A backend fails in its own vocabulary: a `DOMException` for an exhausted quota, a rejected native call, a plain string. Callers should not have to know any of it, so everything foreign is wrapped with the adapter, the operation and the key it happened on. An error this library already raised passes through untouched, so an unavailable backend keeps its own type.
 */
export function callAdapter<Value>(
  adapter: StorageAdapter<unknown>,
  operation: StorageOperation,
  physicalKey: string | undefined,
  report: (error: PlatformStorageError) => PlatformStorageError,
  run: () => MaybePromise<Value>,
): MaybePromise<Value> {
  const fail = (cause: unknown): never => {
    if (isPlatformStorageError(cause)) throw report(cause);

    throw report(new StorageAdapterError({ adapter: adapter.name, operation, physicalKey, cause }));
  };

  try {
    const result = run();

    return isPromiseLike(result) ? Promise.resolve(result).catch(fail) : result;
  } catch (cause) {
    return fail(cause);
  }
}
