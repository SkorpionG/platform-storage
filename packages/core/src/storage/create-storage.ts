import { isSyncStorageAdapter } from "../adapter/adapter";
import type { StorageAdapter } from "../adapter/adapter";
import { STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../errors/codes";
import {
  StorageSchemaError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../errors/errors";
import type { PlatformStorageError } from "../errors/errors";
import type { GetResult, KeyOf } from "../schema/key-definition";
import type { StorageSchemaDefinition } from "../schema/storage-schema";
import type { Serializer } from "../serializer/serializer";
import type { SchemaIssue } from "../types/standard-schema";
import type { MaybePromise } from "../types/utils";
import { applyInvalidPolicy, resolveOnInvalid } from "./invalid-policy";
import type { InvalidContext, OnInvalid } from "./invalid-policy";
import { chain, expectSync } from "./maybe-promise";
import { deserializeWire, resolveMissing, serializeValue, validateValue } from "./pipeline";
import type { EntryContext, ExecutionMode } from "./pipeline";
import type {
  CreateStorageOptions,
  CreateStorageResult,
  GetOptions,
  PlatformStorage,
  SyncStorageMethods,
} from "./platform-storage";
import { createAsyncIo, createSyncIo } from "./storage-io";
import type { StorageIo } from "./storage-io";

/**
 * Builds a storage over a schema and a backend.
 *
 * The result exposes the synchronous methods too when the adapter can answer immediately, so application code can be written once and still read without waiting where the platform allows it.
 *
 * ```ts
 * const storage = createStorage({ schema, adapter: memoryAdapter() });
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

  const asyncIo = createAsyncIo(adapter, report);

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

  /* One key at a time, so a backend that refuses names the key it refused rather than the whole operation. */
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

  const syncIo = createSyncIo(adapter, report);

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
