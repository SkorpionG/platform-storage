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
import type { MaybePromise } from "../types/utils";
import { copyValue } from "./copy-value";
import { applyInvalidPolicy, resolveOnInvalid } from "./invalid-policy";
import type { InvalidContext, OnInvalid } from "./invalid-policy";
import { chain, expectSync, ignoreFailure, isPromiseLike } from "./maybe-promise";
import { decodeWire, isSameWire, resolveMissing, serializeValue, validateValue } from "./pipeline";
import type { DecodeResult, EntryContext, ExecutionMode } from "./pipeline";
import type {
  CreateStorageOptions,
  CreateStorageResult,
  GetOptions,
  PlatformStorage,
  SyncStorageMethods,
} from "./platform-storage";
import { createAsyncIo, createSyncIo } from "./storage-io";
import type { StorageIo } from "./storage-io";
import { createWatchers } from "./watchers";
import type { PreviousWire, Watchers } from "./watchers";
import { createWriteQueue } from "./write-queue";

/** Where a read found something, or the last place it looked. */
interface Located {
  readonly physicalKey: string;
  readonly wire: unknown;
}

type InvalidDecode = Extract<DecodeResult, { readonly kind: "invalid" }>;

/** What a write is replacing, and which name it was found under. */
type LocatedPrevious = PreviousWire & { readonly foundAt?: string };

/** A change a read decided stored data needs, carried out only if that data is still what the read saw. */
interface Repair {
  readonly foundAt: string;
  readonly wire: unknown;
  /** Set where the read already has its answer, so a failure here should not cost the caller that answer. */
  readonly bestEffort: boolean;
  carryOut(io: StorageIo): MaybePromise<void>;
}

interface ReadOutcome {
  readonly value: unknown;
  readonly repair: Repair | undefined;
  /** What the read found, so a write following it need not look again. */
  readonly wire: unknown;
}

function previousNames(entry: EntryContext): ReadonlyArray<string> {
  return entry.definition.readFrom ?? [];
}

/* A write may have landed since the read this repair came from, and a repair must never destroy newer data. */
function stillHolds(io: StorageIo, entry: EntryContext, repair: Repair): MaybePromise<boolean> {
  return chain(io.get(repair.foundAt), (wire) => {
    if (!isSameWire(wire, repair.wire)) return false;
    if (repair.foundAt === entry.physicalKey) return true;

    return chain(io.get(entry.physicalKey), (current) => current === undefined);
  });
}

/* The first name holding anything wins. Reaching the end means the last name tried held nothing, which reads as missing. */
function locate(io: StorageIo, entry: EntryContext): MaybePromise<Located> {
  return previousNames(entry).reduce<MaybePromise<Located>>(
    (found, name) =>
      chain(found, (current) =>
        current.wire === undefined
          ? chain(io.get(name), (wire) => ({ physicalKey: name, wire }))
          : current,
      ),
    chain(io.get(entry.physicalKey), (wire) => ({ physicalKey: entry.physicalKey, wire })),
  );
}

function removeOldNames(io: StorageIo, entry: EntryContext): MaybePromise<void> {
  return previousNames(entry).reduce<MaybePromise<void>>(
    (pending, name) => chain(pending, () => io.remove(name)),
    undefined,
  );
}

/* Old names first: stopping halfway then leaves the value under the current name, where a retry finds it, rather than under an old one that a later read would bring back. */
function removeEverywhere(io: StorageIo, entry: EntryContext): MaybePromise<void> {
  return chain(removeOldNames(io, entry), () => io.remove(entry.physicalKey));
}

/* A write should not fail because the value it replaces could not be read. */
function readPrevious(io: StorageIo, entry: EntryContext): MaybePromise<LocatedPrevious> {
  const unknownPrevious: LocatedPrevious = { known: false };

  try {
    const located = chain(locate(io, entry), ({ physicalKey, wire }): LocatedPrevious => ({
      known: true,
      wire,
      foundAt: physicalKey,
    }));

    return isPromiseLike(located) ? Promise.resolve(located).catch(() => unknownPrevious) : located;
  } catch {
    return unknownPrevious;
  }
}

function invalidContext(
  entry: EntryContext,
  physicalKey: string,
  decoded: InvalidDecode,
): InvalidContext {
  return {
    key: entry.key,
    physicalKey,
    raw: decoded.raw,
    issues: decoded.issues,
    error: decoded.error,
  };
}

/**
 * Builds a storage over a schema and a backend.
 *
 * The result exposes the synchronous methods too when the adapter can answer immediately, so application code can be written once and still read without waiting where the platform allows it.
 *
 * Most applications reach for a platform factory instead, such as `createLocalStorage`. Use this one to pair a schema with an adapter of your own.
 *
 * @param options - The `schema`, the `adapter` to store through, and optionally `onInvalid` for the storage-wide invalid-data policy and `onError` to observe every failure.
 * @returns A storage over that schema. It carries the synchronous half as well when the adapter can answer immediately.
 * @example
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
  const syncIo = isSyncStorageAdapter(adapter) ? createSyncIo(adapter, report) : undefined;
  /* For a read and the write that depends on it. Through the synchronous methods where there are any, so nothing from the synchronous half can land between the two unless a validator makes them wait. */
  const atomicIo = syncIo ?? asyncIo;
  const queue = createWriteQueue();

  /* Keys whose old names are known to be empty, so that frequent writes do not each spend a backend call rediscovering it, which the `sync` area's rate limit would notice. */
  const swept = new Set<string>();

  /* A read's answer without a read's side effects: a callback supplies its replacement, and every named policy reads as the fallback, because a watcher never throws or deletes. */
  function decodeForWatcher(key: string, wire: unknown): MaybePromise<unknown> {
    const entry = entryFor(key);

    return chain(decodeWire(entry, wire, "async"), (decoded) => {
      if (decoded.kind === "valid") return decoded.value;

      if (decoded.kind === "invalid") {
        report(decoded.error);

        const policy = resolveOnInvalid(undefined, entry.definition.onInvalid, options.onInvalid);

        if (typeof policy === "function") {
          return policy(invalidContext(entry, entry.physicalKey, decoded));
        }
      }

      return resolveMissing(entry, "async");
    });
  }

  const watchers = createWatchers({
    adapter,
    owners: new Map(schema.keys.map((key) => [entryFor(key).physicalKey, key])),
    report,
    decode: decodeForWatcher,
    readCurrent: (key) =>
      chain(locate(atomicIo, entryFor(key)), ({ wire }) => decodeForWatcher(key, wire)),
  });

  /** The asynchronous path takes its turn on the key. The synchronous one cannot wait, and has no gap for anything else to run in. */
  const inTurn = <Value>(
    mode: ExecutionMode,
    key: string,
    task: () => MaybePromise<Value>,
  ): MaybePromise<Value> => (mode === "sync" ? task() : queue.run(key, task));

  /** Holds a read back until the writes already started on its key have landed, so a caller always reads its own writes. */
  const afterWrites = (mode: ExecutionMode, key: string): MaybePromise<void> =>
    mode === "sync" ? undefined : queue.settled(key);

  /* The value is already safely under its current name, so failing to tidy up behind it is reported and nothing more. */
  function sweep(io: StorageIo, entry: EntryContext): MaybePromise<void> {
    return ignoreFailure(() =>
      chain(removeOldNames(io, entry), () => {
        swept.add(entry.key);
      }),
    );
  }

  function sweepAfterWrite(io: StorageIo, entry: EntryContext): MaybePromise<void> {
    return previousNames(entry).length === 0 || swept.has(entry.key) ? undefined : sweep(io, entry);
  }

  /*
    Told only after the write has landed, and only where nobody else will say. A repair never comes through here, because the key's value has not changed.

    Whether to tell is decided again once the write lands, because a listener can arrive while it is under way, and a backend that reports nothing would leave it stale.
  */
  function announced(
    io: StorageIo,
    entry: EntryContext,
    newWire: unknown,
    write: () => MaybePromise<void>,
    alreadyRead?: PreviousWire,
  ): MaybePromise<void> {
    const announces = watchers.announcesWrites();

    if (
      !announces &&
      newWire === undefined &&
      previousNames(entry).length > 0 &&
      watchers.isListening()
    ) {
      /* A backend reporting its own writes only ever names the current name, so removing a value still held under an old one would otherwise pass unnoticed. */
      return chain(readPrevious(io, entry), (replaced) =>
        chain(write(), () => {
          if (
            replaced.known &&
            replaced.wire !== undefined &&
            replaced.foundAt !== entry.physicalKey
          ) {
            watchers.wrote(entry.key, replaced, undefined);
          }
        }),
      );
    }

    const previous: MaybePromise<PreviousWire> =
      alreadyRead ??
      (announces && watchers.needsPrevious(entry.key) ? readPrevious(io, entry) : { known: false });

    return chain(previous, (replaced) =>
      chain(write(), () => {
        if (watchers.announcesWrites()) watchers.wrote(entry.key, replaced, newWire);
      }),
    );
  }

  /*
    The stored form is copied rather than serialized again, because a schema's output need not be something it accepts as input.

    Written before removing, so a failure at any point leaves the value in at least one place. Always sweeps, since finding a value under an old name proves that name is not empty.
  */
  function moveForward(io: StorageIo, entry: EntryContext, wire: unknown): MaybePromise<void> {
    return chain(io.set(entry.physicalKey, wire), () => sweep(io, entry));
  }

  function recover(
    mode: ExecutionMode,
    entry: EntryContext,
    located: EntryContext,
    decoded: InvalidDecode,
    wire: unknown,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<ReadOutcome> {
    report(decoded.error);

    const policy = resolveOnInvalid(perCall, entry.definition.onInvalid, options.onInvalid);
    const context = invalidContext(entry, located.physicalKey, decoded);

    let repair: Repair | undefined;

    const value = applyInvalidPolicy(policy, context, {
      remove: () => {
        repair = {
          foundAt: located.physicalKey,
          wire,
          bestEffort: false,
          /* Under an old name, only that name: one tried later may still hold something valid. */
          carryOut: (repairIo): MaybePromise<void> =>
            located.physicalKey === entry.physicalKey
              ? removeEverywhere(repairIo, entry)
              : repairIo.remove(located.physicalKey),
        };
      },
      fallback: () => resolveMissing(entry, mode),
    });

    return chain(value, (resolved) => ({ value: resolved, repair, wire }));
  }

  /** Answers with the value, and with whatever stored data the read found needs changing, leaving the caller to decide when that happens. */
  function read(
    io: StorageIo,
    mode: ExecutionMode,
    entry: EntryContext,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<ReadOutcome> {
    return chain(locate(io, entry), ({ physicalKey, wire }) => {
      const located = physicalKey === entry.physicalKey ? entry : { ...entry, physicalKey };

      return chain(decodeWire(located, wire, mode), (decoded): MaybePromise<ReadOutcome> => {
        if (decoded.kind === "invalid") {
          return recover(mode, entry, located, decoded, wire, perCall);
        }

        if (decoded.kind === "missing") {
          return chain(resolveMissing(entry, mode), (value) => ({
            value,
            repair: undefined,
            wire,
          }));
        }

        return {
          value: decoded.value,
          wire,
          repair:
            physicalKey === entry.physicalKey
              ? undefined
              : {
                  foundAt: physicalKey,
                  wire,
                  bestEffort: true,
                  carryOut: (repairIo) => moveForward(repairIo, entry, wire),
                },
        };
      });
    });
  }

  function finishRead(
    mode: ExecutionMode,
    entry: EntryContext,
    { value, repair }: ReadOutcome,
  ): MaybePromise<unknown> {
    if (repair === undefined) return value;

    const attempt = (): MaybePromise<void> =>
      mode === "sync"
        ? repair.carryOut(atomicIo)
        : queue.run(entry.key, () =>
            chain(stillHolds(atomicIo, entry, repair), (holds) =>
              holds ? repair.carryOut(atomicIo) : undefined,
            ),
          );

    return chain(repair.bestEffort ? ignoreFailure(attempt) : attempt(), () => value);
  }

  function runGet(
    io: StorageIo,
    mode: ExecutionMode,
    key: string,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<unknown> {
    const entry = entryFor(key);

    return chain(afterWrites(mode, key), () =>
      chain(read(io, mode, entry, perCall), (outcome) => finishRead(mode, entry, outcome)),
    );
  }

  function writeValue(
    io: StorageIo,
    mode: ExecutionMode,
    entry: EntryContext,
    value: unknown,
    alreadyRead?: PreviousWire,
  ): MaybePromise<void> {
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
      if (validated.value === undefined) {
        return announced(io, entry, undefined, () => removeEverywhere(io, entry), alreadyRead);
      }

      const serialized = serializeValue(entry, validated.value);

      if (serialized.kind === "invalid") throw report(serialized.error);

      return announced(
        io,
        entry,
        serialized.wire,
        () => chain(io.set(entry.physicalKey, serialized.wire), () => sweepAfterWrite(io, entry)),
        alreadyRead,
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

    return inTurn(mode, key, () => writeValue(io, mode, entry, value));
  }

  /*
    Whatever repair the read asked for is dropped on purpose: the write that follows replaces the value and clears the old names, and carrying it out first would be a second write, or a wait on the turn this already holds.

    The updater is given a copy because a default, an `onInvalid` replacement or a backend may share the value it read, and nothing should change until the result has passed validation and serialization.

    The updater's parameter is `never` so that one taking any key's value can be passed here. Each is only ever handed the value its own key just read as.
  */
  function runUpdate(
    io: StorageIo,
    mode: ExecutionMode,
    key: string,
    updater: (current: never) => unknown,
  ): MaybePromise<void> {
    const entry = entryFor(key);

    return inTurn(mode, key, () =>
      chain(read(io, mode, entry, undefined), ({ value, wire }) =>
        writeValue(io, mode, entry, updater(copyValue(value) as never), { known: true, wire }),
      ),
    );
  }

  function runRemove(io: StorageIo, mode: ExecutionMode, key: string): MaybePromise<void> {
    const entry = entryFor(key);

    return inTurn(mode, key, () =>
      announced(io, entry, undefined, () => removeEverywhere(io, entry)),
    );
  }

  function runHas(io: StorageIo, mode: ExecutionMode, key: string): MaybePromise<boolean> {
    const entry = entryFor(key);

    return chain(afterWrites(mode, key), () =>
      previousNames(entry).reduce<MaybePromise<boolean>>(
        (found, name) => chain(found, (present) => present || io.has(name)),
        io.has(entry.physicalKey),
      ),
    );
  }

  /*
    One key at a time, so a backend that refuses names the key it refused rather than the whole operation.

    Each key's turn is taken before any of the work starts, so a write or a read begun after `clear` comes after it on every key, not only the ones already reached.
  */
  function runClear(io: StorageIo, mode: ExecutionMode): MaybePromise<void> {
    let previous: MaybePromise<void> = undefined;

    for (const key of schema.keys) {
      const entry = entryFor(key);
      const before: MaybePromise<void> = previous;

      previous = inTurn(mode, key, () =>
        chain(before, () => announced(io, entry, undefined, () => removeEverywhere(io, entry))),
      );
    }

    return previous;
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
    update: (key, updater) =>
      Promise.resolve().then(() => runUpdate(atomicIo, "async", key, updater)),
    remove: (key) => Promise.resolve().then(() => runRemove(asyncIo, "async", key)),
    has: (key) => Promise.resolve().then(() => runHas(asyncIo, "async", key)),
    clear: () => Promise.resolve().then(() => runClear(asyncIo, "async")),

    physicalKey: (key) => entryFor(key).physicalKey,

    watch: (key, listener) =>
      watchers.watch(entryFor(key).key, listener as Parameters<Watchers["watch"]>[1]),
    onChange: (listener) => watchers.onChange(listener as Parameters<Watchers["onChange"]>[0]),
  };

  /*
    The two returns below are the one place a conditional return type has to be asserted: whether the synchronous half exists is decided by a runtime check that the type system expresses as `Adapter extends SyncStorageAdapter`, and nothing can prove the two agree. They are kept adjacent so the pair is read together.
  */
  if (syncIo === undefined) {
    return storage as CreateStorageResult<Definition, Adapter>;
  }

  const syncMethods: SyncStorageMethods<Definition> = {
    getSync: <Key extends KeyOf<Definition>>(key: Key, getOptions?: GetOptions<Definition[Key]>) =>
      expectSync(runGet(syncIo, "sync", key, getOptions?.onInvalid), asyncInSyncMode) as GetResult<
        Definition[Key]
      >,
    setSync: (key, value) => {
      expectSync(runSet(syncIo, "sync", key, value), asyncInSyncMode);
    },
    updateSync: (key, updater) => {
      expectSync(runUpdate(syncIo, "sync", key, updater), asyncInSyncMode);
    },
    removeSync: (key) => {
      expectSync(runRemove(syncIo, "sync", key), asyncInSyncMode);
    },
    hasSync: (key) => expectSync(runHas(syncIo, "sync", key), asyncInSyncMode),
    clearSync: () => {
      expectSync(runClear(syncIo, "sync"), asyncInSyncMode);
    },
  };

  return { ...storage, ...syncMethods } as CreateStorageResult<Definition, Adapter>;
}
