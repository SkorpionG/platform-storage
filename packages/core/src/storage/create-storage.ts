import { isSyncStorageAdapter } from "../adapter/adapter";
import type { StorageAdapter, SyncStorageAdapter, WireOf } from "../adapter/adapter";
import { STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../errors/codes";
import {
  StorageSchemaError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../errors/errors";
import type { PlatformStorageError } from "../errors/errors";
import type { GetResult, KeyOf, SetValue } from "../schema/key-definition";
import type { StorageSchema, StorageSchemaDefinition } from "../schema/storage-schema";
import type { Serializer } from "../serializer/serializer";
import type { SchemaIssue } from "../types/standard-schema";
import type { MaybePromise } from "../types/utils";
import { callAdapter } from "./adapter-calls";
import { applyInvalidPolicy, resolveOnInvalid } from "./invalid-policy";
import type { InvalidContext, OnInvalid } from "./invalid-policy";
import { chain, expectSync } from "./maybe-promise";
import { deserializeWire, resolveMissing, serializeValue, validateValue } from "./pipeline";
import type { EntryContext, ExecutionMode } from "./pipeline";

export interface GetOptions<Definition> {
  /**
   * Overrides the key's and the storage's policy for this read alone.
   *
   * A callback given here is checked against what the key can hold, because nothing is being inferred at a call site the way it is in a schema declaration.
   */
  readonly onInvalid?: OnInvalid<GetResult<Definition>> | undefined;
}

export interface CreateStorageOptions<
  Definition extends StorageSchemaDefinition,
  Adapter extends StorageAdapter<unknown>,
> {
  readonly schema: StorageSchema<Definition>;
  readonly adapter: Adapter;
  /** Replaces the adapter's own serializer. Typed against what that adapter transports. */
  readonly serializer?: Serializer<WireOf<Adapter>> | undefined;
  /** The policy for every key that does not declare its own. Defaults to `"fallback"`. */
  readonly onInvalid?: OnInvalid<unknown> | undefined;
  /**
   * Called for every failure, whether it is thrown or handled.
   *
   * This is what keeps a falling-back read from being a silent one: wire it to a logger and stale data still shows up, without a read ever breaking the surface reading it.
   */
  readonly onError?: ((error: PlatformStorageError) => void) | undefined;
}

export interface PlatformStorage<Definition extends StorageSchemaDefinition> {
  readonly schema: StorageSchema<Definition>;
  readonly adapter: StorageAdapter<unknown>;

  get<Key extends KeyOf<Definition>>(
    key: Key,
    options?: GetOptions<Definition[Key]>,
  ): Promise<GetResult<Definition[Key]>>;
  set<Key extends KeyOf<Definition>>(key: Key, value: SetValue<Definition[Key]>): Promise<void>;
  remove(key: KeyOf<Definition>): Promise<void>;
  /** Whether anything is stored, without validating it. */
  has(key: KeyOf<Definition>): Promise<boolean>;
  /** Removes only the keys this schema declares, never anything else sharing the backend. */
  clear(): Promise<void>;

  /** The key the backend stores under, for tooling that has to address it directly. */
  physicalKey(key: KeyOf<Definition>): string;
}

/** The synchronous half, present only when the adapter can answer immediately. */
export interface SyncStorageMethods<Definition extends StorageSchemaDefinition> {
  getSync<Key extends KeyOf<Definition>>(
    key: Key,
    options?: GetOptions<Definition[Key]>,
  ): GetResult<Definition[Key]>;
  setSync<Key extends KeyOf<Definition>>(key: Key, value: SetValue<Definition[Key]>): void;
  removeSync(key: KeyOf<Definition>): void;
  hasSync(key: KeyOf<Definition>): boolean;
  clearSync(): void;
}

export type SyncPlatformStorage<Definition extends StorageSchemaDefinition> =
  PlatformStorage<Definition> & SyncStorageMethods<Definition>;

export type CreateStorageResult<
  Definition extends StorageSchemaDefinition,
  Adapter extends StorageAdapter<unknown>,
> =
  Adapter extends SyncStorageAdapter<unknown>
    ? SyncPlatformStorage<Definition>
    : PlatformStorage<Definition>;

/** How the engine reaches its backend, in whichever mode it is running. */
interface StorageIo {
  get(physicalKey: string): MaybePromise<unknown>;
  set(physicalKey: string, wire: unknown): MaybePromise<void>;
  remove(physicalKey: string): MaybePromise<void>;
  has(physicalKey: string): MaybePromise<boolean>;
}

/**
 * Builds a storage over a schema and a backend.
 *
 * The result exposes the synchronous methods too when the adapter can answer immediately, so application code can be written once and still read without waiting where the platform allows it.
 *
 * ```ts
 * const storage = createStorage({ schema, adapter: localStorageAdapter() });
 *
 * await storage.set("theme", "dark");
 * const theme = await storage.get("theme");
 * ```
 */
export function createStorage<
  Definition extends StorageSchemaDefinition,
  Adapter extends StorageAdapter<unknown>,
>(options: CreateStorageOptions<Definition, Adapter>): CreateStorageResult<Definition, Adapter> {
  const { schema, adapter } = options;
  const serializer: Serializer<unknown> = options.serializer ?? adapter.serializer;

  const report = (error: PlatformStorageError): PlatformStorageError => {
    options.onError?.(error);
    return error;
  };

  function entryFor(key: string): EntryContext {
    // `hasOwn` rather than a plain lookup: a key like "toString" would otherwise find something on the prototype chain and be treated as declared.
    const definition = Object.hasOwn(schema.definition, key) ? schema.definition[key] : undefined;
    const physicalKey = schema.physicalKeys[key];

    if (definition === undefined || physicalKey === undefined) {
      throw report(new UnknownStorageKeyError({ key, knownKeys: schema.keys }));
    }

    return { key, physicalKey, definition, serializer };
  }

  function buildAsyncIo(): StorageIo {
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

        return has === undefined
          ? chain(get(physicalKey), (wire) => wire !== undefined)
          : callAdapter(adapter, STORAGE_OPERATION.Has, physicalKey, report, () =>
              has.call(adapter, physicalKey),
            );
      },
    };
  }

  function buildSyncIo(sync: SyncStorageAdapter<unknown>): StorageIo {
    const get = (physicalKey: string): MaybePromise<unknown> =>
      callAdapter(adapter, STORAGE_OPERATION.Get, physicalKey, report, () =>
        sync.getSync(physicalKey),
      );

    return {
      get,
      set: (physicalKey, wire) =>
        callAdapter(adapter, STORAGE_OPERATION.Set, physicalKey, report, () => {
          sync.setSync(physicalKey, wire);
        }),
      remove: (physicalKey) =>
        callAdapter(adapter, STORAGE_OPERATION.Remove, physicalKey, report, () => {
          sync.removeSync(physicalKey);
        }),
      has: (physicalKey) => {
        const { hasSync } = sync;

        return hasSync === undefined
          ? chain(get(physicalKey), (wire) => wire !== undefined)
          : callAdapter(adapter, STORAGE_OPERATION.Has, physicalKey, report, () =>
              hasSync.call(sync, physicalKey),
            );
      },
    };
  }

  const asyncIo = buildAsyncIo();

  function recover(
    io: StorageIo,
    mode: ExecutionMode,
    entry: EntryContext,
    error: InvalidContext["error"],
    issues: ReadonlyArray<SchemaIssue>,
    raw: unknown,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<unknown> {
    report(error);

    const policy = resolveOnInvalid(perCall, entry.definition.onInvalid, options.onInvalid);
    const context: InvalidContext = {
      key: entry.key,
      physicalKey: entry.physicalKey,
      raw,
      issues,
      error,
    };

    return applyInvalidPolicy(policy, context, {
      remove: () => io.remove(entry.physicalKey),
      fallback: () => resolveMissing(entry, mode),
    });
  }

  function runGet(
    io: StorageIo,
    mode: ExecutionMode,
    key: string,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<unknown> {
    const entry = entryFor(key);

    return chain(io.get(entry.physicalKey), (wire) => {
      const deserialized = deserializeWire(entry, wire);

      if (deserialized.kind === "missing") return resolveMissing(entry, mode);

      if (deserialized.kind === "invalid") {
        const { error } = deserialized;
        return recover(io, mode, entry, error, [{ message: error.message }], wire, perCall);
      }

      return chain(
        validateValue(entry.definition.schema, deserialized.value, mode),
        (validated) => {
          if (validated.kind === "valid") return validated.value;

          const error = new StorageValidationError({
            key: entry.key,
            physicalKey: entry.physicalKey,
            operation: STORAGE_OPERATION.Get,
            issues: validated.issues,
            raw: deserialized.value,
          });

          return recover(io, mode, entry, error, validated.issues, deserialized.value, perCall);
        },
      );
    });
  }

  function runSet(
    io: StorageIo,
    mode: ExecutionMode,
    key: string,
    value: unknown,
  ): MaybePromise<void> {
    const entry = entryFor(key);

    return chain(validateValue(entry.definition.schema, value, mode), (validated) => {
      if (validated.kind !== "valid") {
        throw report(
          new StorageValidationError({
            key: entry.key,
            physicalKey: entry.physicalKey,
            operation: STORAGE_OPERATION.Set,
            issues: validated.issues,
            raw: value,
          }),
        );
      }

      // No wire value represents `undefined`, so storing one means removing the entry.
      if (validated.value === undefined) return io.remove(entry.physicalKey);

      const serialized = serializeValue(entry, validated.value);

      if (serialized.kind === "invalid") throw report(serialized.error);

      return io.set(entry.physicalKey, serialized.wire);
    });
  }

  function runRemove(io: StorageIo, key: string): MaybePromise<void> {
    return io.remove(entryFor(key).physicalKey);
  }

  function runHas(io: StorageIo, key: string): MaybePromise<boolean> {
    return io.has(entryFor(key).physicalKey);
  }

  function runClear(io: StorageIo): MaybePromise<void> {
    let pending: MaybePromise<void> = undefined;

    for (const key of schema.keys) {
      const { physicalKey } = entryFor(key);
      pending = chain(pending, () => io.remove(physicalKey));
    }

    return pending;
  }

  /** Raised if a stage the synchronous path relies on turns out to answer asynchronously after all. */
  const asyncInSyncMode = (): Error =>
    report(
      new StorageSchemaError(
        `The "${adapter.name}" adapter reports that it answers immediately but did not. A synchronous read cannot wait, so use the asynchronous methods for this storage.`,
        STORAGE_ERROR_CODE.AsyncValidatorInSyncMode,
      ),
    );

  const storage: PlatformStorage<Definition> = {
    schema,
    adapter,

    get: <Key extends KeyOf<Definition>>(key: Key, getOptions?: GetOptions<Definition[Key]>) =>
      Promise.resolve().then(() => runGet(asyncIo, "async", key, getOptions?.onInvalid)) as Promise<
        GetResult<Definition[Key]>
      >,
    set: (key, value) => Promise.resolve().then(() => runSet(asyncIo, "async", key, value)),
    remove: (key) => Promise.resolve().then(() => runRemove(asyncIo, key)),
    has: (key) => Promise.resolve().then(() => runHas(asyncIo, key)),
    clear: () => Promise.resolve().then(() => runClear(asyncIo)),

    physicalKey: (key) => entryFor(key).physicalKey,
  };

  /*
    The two returns below are the one place a conditional return type has to be asserted: whether the synchronous half exists is decided by a runtime check that the type system expresses as `Adapter extends SyncStorageAdapter`, and nothing can prove the two agree. They are kept adjacent so the pair is read together.
  */
  if (!isSyncStorageAdapter(adapter)) {
    return storage as CreateStorageResult<Definition, Adapter>;
  }

  const syncIo = buildSyncIo(adapter);

  const syncMethods: SyncStorageMethods<Definition> = {
    getSync: <Key extends KeyOf<Definition>>(key: Key, getOptions?: GetOptions<Definition[Key]>) =>
      expectSync(runGet(syncIo, "sync", key, getOptions?.onInvalid), asyncInSyncMode) as GetResult<
        Definition[Key]
      >,
    setSync: (key, value) => {
      expectSync(runSet(syncIo, "sync", key, value), asyncInSyncMode);
    },
    removeSync: (key) => {
      expectSync(runRemove(syncIo, key), asyncInSyncMode);
    },
    hasSync: (key) => expectSync(runHas(syncIo, key), asyncInSyncMode),
    clearSync: () => {
      expectSync(runClear(syncIo), asyncInSyncMode);
    },
  };

  return { ...storage, ...syncMethods } as CreateStorageResult<Definition, Adapter>;
}
