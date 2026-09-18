import type { StorageAdapter, SyncStorageAdapter } from "../adapter/adapter";
import { STORAGE_OPERATION } from "../errors/codes";
import type { MaybePromise } from "../types/utils";
import { callAdapter } from "./adapter-calls";
import type { ReportError } from "./adapter-calls";
import { chain } from "./maybe-promise";

/**
 * How the engine reaches its backend, in whichever mode it is running.
 *
 * Both modes answer through `MaybePromise`, which is what lets one set of operations serve the synchronous and the asynchronous halves of the API without being written twice.
 */
export interface StorageIo {
  get(physicalKey: string): MaybePromise<unknown>;
  set(physicalKey: string, wire: unknown): MaybePromise<void>;
  remove(physicalKey: string): MaybePromise<void>;
  has(physicalKey: string): MaybePromise<boolean>;
}

/** Reaches an adapter through its asynchronous methods, wrapping whatever the backend throws. */
export function createAsyncIo(adapter: StorageAdapter<unknown>, report: ReportError): StorageIo {
  const get = (physicalKey: string): MaybePromise<unknown> =>
    callAdapter(adapter, STORAGE_OPERATION.Get, physicalKey, report, () =>
      adapter.get(physicalKey),
    );

  return {
    get,
    set: (physicalKey, wire) =>
      callAdapter(adapter, STORAGE_OPERATION.Set, physicalKey, report, () =>
        adapter.set(physicalKey, wire),
      ),
    remove: (physicalKey) =>
      callAdapter(adapter, STORAGE_OPERATION.Remove, physicalKey, report, () =>
        adapter.remove(physicalKey),
      ),
    has: (physicalKey) => {
      const { has } = adapter;

      // `call` rather than a bare invocation, because destructuring an optional method loses its receiver.
      return has === undefined
        ? chain(get(physicalKey), (wire) => wire !== undefined)
        : callAdapter(adapter, STORAGE_OPERATION.Has, physicalKey, report, () =>
            has.call(adapter, physicalKey),
          );
    },
  };
}

/** The same, through the methods that answer immediately, so nothing on this path ever produces a promise. */
export function createSyncIo(adapter: SyncStorageAdapter<unknown>, report: ReportError): StorageIo {
  const get = (physicalKey: string): MaybePromise<unknown> =>
    callAdapter(adapter, STORAGE_OPERATION.Get, physicalKey, report, () =>
      adapter.getSync(physicalKey),
    );

  return {
    get,
    set: (physicalKey, wire) =>
      callAdapter(adapter, STORAGE_OPERATION.Set, physicalKey, report, () => {
        adapter.setSync(physicalKey, wire);
      }),
    remove: (physicalKey) =>
      callAdapter(adapter, STORAGE_OPERATION.Remove, physicalKey, report, () => {
        adapter.removeSync(physicalKey);
      }),
    has: (physicalKey) => {
      const { hasSync } = adapter;

      return hasSync === undefined
        ? chain(get(physicalKey), (wire) => wire !== undefined)
        : callAdapter(adapter, STORAGE_OPERATION.Has, physicalKey, report, () =>
            hasSync.call(adapter, physicalKey),
          );
    },
  };
}
