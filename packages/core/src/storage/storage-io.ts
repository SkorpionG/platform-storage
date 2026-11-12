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
  /** The names that hold something, each with what it holds. Asks for nothing when given no names. */
  getMany(physicalKeys: ReadonlyArray<string>): MaybePromise<ReadonlyMap<string, unknown>>;
  setMany(entries: ReadonlyMap<string, unknown>): MaybePromise<void>;
  removeMany(physicalKeys: ReadonlyArray<string>): MaybePromise<void>;
  /** Every name the backend holds, where it can list them in this mode. */
  readonly keys: (() => MaybePromise<ReadonlyArray<string>>) | undefined;
}

/** How one mode reaches a backend's batch methods and its listing, where it has them. */
interface BatchMethods {
  readonly getMany:
    | ((keys: ReadonlyArray<string>) => MaybePromise<ReadonlyMap<string, unknown>>)
    | undefined;
  readonly setMany: ((entries: ReadonlyMap<string, unknown>) => MaybePromise<void>) | undefined;
  readonly removeMany: ((keys: ReadonlyArray<string>) => MaybePromise<void>) | undefined;
  readonly keys: (() => MaybePromise<ReadonlyArray<string>>) | undefined;
}

/*
  One backend call where the backend offers one, and otherwise each name in turn through the single-name operations, so a failure there still names the key it happened on. A failure inside a batch call names the batch operation instead, since nothing says which name the backend refused.

  Listing has no fallback, since only the backend knows what it holds beyond what a schema declares.
*/
function withBatches(
  adapter: StorageAdapter<unknown>,
  report: ReportError,
  single: Pick<StorageIo, "get" | "set" | "remove" | "has">,
  batch: BatchMethods,
): StorageIo {
  const { getMany, setMany, removeMany, keys } = batch;

  return {
    ...single,
    keys:
      keys === undefined
        ? undefined
        : () => callAdapter(adapter, STORAGE_OPERATION.Keys, undefined, report, keys),
    getMany: (physicalKeys) => {
      if (physicalKeys.length === 0) return new Map();

      if (getMany !== undefined) {
        return callAdapter(adapter, STORAGE_OPERATION.GetMany, undefined, report, () =>
          getMany(physicalKeys),
        );
      }

      return physicalKeys.reduce<MaybePromise<Map<string, unknown>>>(
        (found, physicalKey) =>
          chain(found, (held) =>
            chain(single.get(physicalKey), (wire) =>
              wire === undefined ? held : held.set(physicalKey, wire),
            ),
          ),
        new Map<string, unknown>(),
      );
    },
    setMany: (entries) => {
      if (entries.size === 0) return undefined;

      if (setMany !== undefined) {
        return callAdapter(adapter, STORAGE_OPERATION.SetMany, undefined, report, () =>
          setMany(entries),
        );
      }

      return [...entries].reduce<MaybePromise<void>>(
        (pending, [physicalKey, wire]) => chain(pending, () => single.set(physicalKey, wire)),
        undefined,
      );
    },
    removeMany: (physicalKeys) => {
      if (physicalKeys.length === 0) return undefined;

      if (removeMany !== undefined) {
        return callAdapter(adapter, STORAGE_OPERATION.RemoveMany, undefined, report, () =>
          removeMany(physicalKeys),
        );
      }

      return physicalKeys.reduce<MaybePromise<void>>(
        (pending, physicalKey) => chain(pending, () => single.remove(physicalKey)),
        undefined,
      );
    },
  };
}

/** Reaches an adapter through its asynchronous methods, wrapping whatever the backend throws. */
export function createAsyncIo(adapter: StorageAdapter<unknown>, report: ReportError): StorageIo {
  const get = (physicalKey: string): MaybePromise<unknown> =>
    callAdapter(adapter, STORAGE_OPERATION.Get, physicalKey, report, () =>
      adapter.get(physicalKey),
    );

  const { getMany, setMany, removeMany, keys } = adapter;

  return withBatches(
    adapter,
    report,
    {
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
    },
    {
      getMany: getMany === undefined ? undefined : (names) => getMany.call(adapter, names),
      setMany: setMany === undefined ? undefined : (entries) => setMany.call(adapter, entries),
      removeMany: removeMany === undefined ? undefined : (names) => removeMany.call(adapter, names),
      keys: keys === undefined ? undefined : () => keys.call(adapter),
    },
  );
}

/** The same, through the methods that answer immediately, so nothing on this path ever produces a promise. */
export function createSyncIo(adapter: SyncStorageAdapter<unknown>, report: ReportError): StorageIo {
  const get = (physicalKey: string): MaybePromise<unknown> =>
    callAdapter(adapter, STORAGE_OPERATION.Get, physicalKey, report, () =>
      adapter.getSync(physicalKey),
    );

  const { getManySync, setManySync, removeManySync, keysSync } = adapter;

  return withBatches(
    adapter,
    report,
    {
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
    },
    {
      getMany: getManySync === undefined ? undefined : (names) => getManySync.call(adapter, names),
      setMany:
        setManySync === undefined
          ? undefined
          : (entries) => {
              setManySync.call(adapter, entries);
            },
      removeMany:
        removeManySync === undefined
          ? undefined
          : (names) => {
              removeManySync.call(adapter, names);
            },
      keys: keysSync === undefined ? undefined : () => keysSync.call(adapter),
    },
  );
}
