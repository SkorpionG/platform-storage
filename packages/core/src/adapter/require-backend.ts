import { StorageUnavailableError } from "../errors/errors";
import type { StorageAdapterErrorOptions } from "../errors/errors";

/**
 * Reaches for a backend that may not be there.
 *
 * A function rather than a value, because on several platforms the access itself can fail rather than merely answer with nothing: `window.localStorage` throws in Safari private browsing and in a sandboxed iframe, and an extension API may not have arrived yet in a worker that is still starting. Answering with `null` or `undefined` means the same as throwing, since that is how code that has already checked usually reports there is nothing here.
 */
export type BackendSource<Handle> = () => Handle | null | undefined;

/** What an unreachable backend is reported as. Derived from the error's own options, so it cannot drift from them. */
export type BackendContext = Omit<StorageAdapterErrorOptions, "cause" | "message">;

/**
 * Resolves a backend handle, or reports that the backend is not there.
 *
 * Adapters call this on every operation rather than once at construction, because a storage is usually built while a module is loading and long before anything reads from it. Resolving late is what lets an adapter be built in a context that has no backend, report `StorageUnavailableError` rather than crashing, and start working if the backend appears later.
 *
 * @param source - Reaches for the backend. May throw, or answer with `null` or `undefined`.
 * @param context - Names the adapter and the operation, so the error says which storage was unreachable.
 * @returns The handle, once it is known to be there.
 * @throws {StorageUnavailableError} When the source throws or answers with nothing.
 * @example
 * ```ts
 * const storage = requireBackend(() => window.localStorage, {
 *   adapter: "localStorage",
 *   operation: STORAGE_OPERATION.Get,
 * });
 * ```
 */
export function requireBackend<Handle>(
  source: BackendSource<Handle>,
  context: BackendContext,
): Handle {
  let handle: Handle | null | undefined;

  try {
    handle = source();
  } catch (cause) {
    throw new StorageUnavailableError({ ...context, cause });
  }

  if (handle === undefined || handle === null) throw new StorageUnavailableError(context);

  return handle;
}
