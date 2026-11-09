import { isSyncStorageAdapter } from "../adapter/adapter";
import type { StorageAdapter } from "../adapter/adapter";
import { STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../errors/codes";
import {
  StorageSchemaError,
  StorageSerializationError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../errors/errors";
import type { PlatformStorageError } from "../errors/errors";
import type { GetResult, KeyOf } from "../schema/key-definition";
import type { StorageSchemaDefinition } from "../schema/storage-schema";
import type { Serializer } from "../serializer/serializer";
import type { SchemaIssue } from "../types/standard-schema";
import type { MaybePromise } from "../types/utils";
import { copyValue } from "./copy-value";
import { applyInvalidPolicy, resolveOnInvalid } from "./invalid-policy";
import type { InvalidContext, OnInvalid } from "./invalid-policy";
import { chain, discardPromise, expectSync, ignoreFailure, isPromiseLike } from "./maybe-promise";
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
import { isSameValue } from "./same-value";
import { createWatchers } from "./watchers";
import type { PreviousWire, Watchers } from "./watchers";
import { createWriteQueue } from "./write-queue";

/** Where a read found something, or the last place it looked. */
interface Located {
  readonly physicalKey: string;
  readonly wire: unknown;
}

type FailedDecode = Extract<DecodeResult, { readonly kind: "invalid" | "newer" }>;

/** What a write is replacing, and which name it was found under. */
type LocatedPrevious = PreviousWire & { readonly foundAt?: string };

/** A change a read decided stored data needs, carried out only if that data is still what the read saw. */
interface Repair {
  readonly foundAt: string;
  readonly wire: unknown;
  /** Set where the read already has its answer, so a failure here should not cost the caller that answer. */
  readonly bestEffort: boolean;
  carryOut(io: StorageIo): MaybePromise<void>;
  /** Work that may have to wait, done before the stored data is checked so that anything landing meanwhile is seen. Answers whether to go on. */
  readonly prepare?: (() => MaybePromise<boolean>) | undefined;
  /** Told when a best-effort repair could not be carried out. */
  readonly onFailure?: (() => void) | undefined;
}

/** The replacement a key's `recover` produced, already validated. */
interface Recovered {
  readonly value: unknown;
}

interface ReadOutcome {
  readonly value: unknown;
  readonly repair: Repair | undefined;
  /** What the read found, so a write following it need not look again. */
  readonly wire: unknown;
  /** Set where the value answered with stands in for stored data this code cannot judge, so nothing derived from it may replace that data. */
  readonly refusal?: FailedDecode["error"] | undefined;
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

/* The data may be perfectly good and this code the problem: it is newer than the code, or a step in the chain is broken. A later release can still read it, so it must survive this one. */
function cannotBeJudged(decoded: FailedDecode): boolean {
  return decoded.kind === "newer" || decoded.error.code === STORAGE_ERROR_CODE.Migration;
}

function invalidContext(
  entry: EntryContext,
  physicalKey: string,
  decoded: FailedDecode,
): InvalidContext {
  return {
    key: entry.key,
    physicalKey,
    raw: decoded.raw,
    issues: decoded.issues,
    error: decoded.error,
  };
}

/*
  Newer data is out of reach, because a repair written over it would replace data a later release can still read. A value a broken step could not carry is within reach: declaring `recover` is saying what to do with it.

  A `recover` that fails is reported beside the failure it was asked to mend, which the caller still reports.
*/
function attemptRecover(
  mode: ExecutionMode,
  entry: EntryContext,
  located: EntryContext,
  decoded: DecodeResult,
  tell: (error: PlatformStorageError) => unknown,
): MaybePromise<Recovered | undefined> {
  const { recover } = entry.definition;

  if (decoded.kind !== "invalid" || recover === undefined) return undefined;

  const refused = (
    issues: ReadonlyArray<SchemaIssue>,
    raw: unknown,
    cause?: unknown,
  ): undefined => {
    tell(
      new StorageValidationError({
        key: entry.key,
        physicalKey: located.physicalKey,
        operation: STORAGE_OPERATION.Get,
        issues,
        raw,
        cause,
      }),
    );

    return undefined;
  };

  let repaired: unknown;

  try {
    repaired = recover(decoded.raw);
  } catch (cause) {
    return refused([{ message: "`recover` threw." }], decoded.raw, cause);
  }

  if (repaired === undefined) return undefined;

  if (isPromiseLike(repaired)) {
    discardPromise(repaired);

    return refused(
      [{ message: "`recover` returned a promise. It has to be synchronous." }],
      decoded.raw,
    );
  }

  return chain(validateValue(entry.definition.schema, repaired, mode), (validated) =>
    validated.kind === "valid" ? { value: validated.value } : refused(validated.issues, repaired),
  );
}

/** What saving a value would store, or why it must not be saved. */
type WriteBackForm =
  | { readonly kind: "ready"; readonly wire: unknown }
  | { readonly kind: "refused"; readonly error: PlatformStorageError };

/*
  A save has to read back valid, current and as the same value. A schema need not accept its own output, or answer the same for it, and replacing good data with something that reads differently is worse than leaving it behind. The values are compared as values, because a `Date` and its text, or a `Map` and an empty object, store identically.

  Nothing represents `undefined`: a backend may drop the field, leaving something that is no longer an envelope.
*/
function writeBackForm(
  mode: ExecutionMode,
  entry: EntryContext,
  value: unknown,
): MaybePromise<WriteBackForm> {
  const refused = (cause?: unknown): WriteBackForm => ({
    kind: "refused",
    error: new StorageSerializationError({
      key: entry.key,
      physicalKey: entry.physicalKey,
      direction: "serialize",
      raw: value,
      cause,
    }),
  });

  if (value === undefined) return refused();

  const serialized = serializeValue(entry, value);

  if (serialized.kind === "invalid") return { kind: "refused", error: serialized.error };

  return chain(decodeWire(entry, serialized.wire, mode), (decoded) =>
    decoded.kind === "valid" && !decoded.behind && isSameValue(decoded.value, value)
      ? { kind: "ready", wire: serialized.wire }
      : refused("error" in decoded ? decoded.error : undefined),
  );
}

/* Quiet, because the same data is decoded again if this turns out to be a real change, and that pass is the one that reports. */
function repairedForm(entry: EntryContext, wire: unknown): MaybePromise<unknown> {
  const saved = (value: unknown): MaybePromise<unknown> =>
    chain(writeBackForm("async", entry, value), (form) =>
      form.kind === "ready" ? form.wire : undefined,
    );

  return chain(decodeWire(entry, wire, "async"), (decoded) => {
    if (decoded.kind === "valid") return decoded.behind ? saved(decoded.value) : undefined;

    return chain(
      attemptRecover("async", entry, entry, decoded, () => undefined),
      (recovered) => (recovered === undefined ? undefined : saved(recovered.value)),
    );
  });
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
  /*
    For a read and the write that depends on it. Through the synchronous methods where there are any, so nothing from the synchronous half can land between the two unless a validator makes them wait.

    A step, a `recover` or a validator can still write to the key from inside the read, which is why a repair checks the stored data on this path as well.
  */
  const atomicIo = syncIo ?? asyncIo;
  const queue = createWriteQueue();

  /* Keys whose old names are known to be empty, so that frequent writes do not each spend a backend call rediscovering it, which the `sync` area's rate limit would notice. */
  const swept = new Set<string>();

  /* Each key's write-back that failed, with the stored data it failed for, so that a full backend or the `sync` area's rate limit is not hit again by every read of data that has not changed. */
  const failedWriteBacks = new Map<string, unknown>();

  /* A read's answer without a read's side effects: `recover` answers without its result being saved, a callback supplies its replacement, and every named policy reads as the fallback, because a watcher never throws or deletes. */
  function decodeForWatcher(key: string, wire: unknown): MaybePromise<unknown> {
    const entry = entryFor(key);

    return chain(decodeWire(entry, wire, "async"), (decoded) => {
      if (decoded.kind === "valid") return decoded.value;

      if (decoded.kind === "missing") return resolveMissing(entry, "async");

      return chain(attemptRecover("async", entry, entry, decoded, report), (recovered) => {
        if (recovered !== undefined) return recovered.value;

        report(decoded.error);

        const policy = resolveOnInvalid(undefined, entry.definition.onInvalid, options.onInvalid);

        return typeof policy === "function"
          ? policy(invalidContext(entry, entry.physicalKey, decoded))
          : resolveMissing(entry, "async");
      });
    });
  }

  const watchers = createWatchers({
    adapter,
    owners: new Map(schema.keys.map((key) => [entryFor(key).physicalKey, key])),
    report,
    decode: decodeForWatcher,
    repairs: (key) => {
      const { versions, recover } = entryFor(key).definition;

      return versions !== undefined || recover !== undefined;
    },
    isRepairEcho: (key, oldWire, newWire) =>
      chain(
        repairedForm(entryFor(key), oldWire),
        (repaired) => repaired !== undefined && isSameWire(repaired, newWire),
      ),
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

  /*
    Answers with no repair where this same stored data has already failed.

    The stored form is worked out when the repair is carried out, so a read whose repair is dropped does no work for it and a failure there costs the read nothing.
  */
  function writeBack(
    mode: ExecutionMode,
    entry: EntryContext,
    found: Located,
    value: unknown,
    tidy: (io: StorageIo) => MaybePromise<void>,
  ): Repair | undefined {
    if (failedWriteBacks.has(entry.key)) {
      if (isSameWire(failedWriteBacks.get(entry.key), found.wire)) return undefined;

      failedWriteBacks.delete(entry.key);
    }

    const remember = (): void => {
      failedWriteBacks.set(entry.key, found.wire);
    };

    let newWire: unknown;

    return {
      foundAt: found.physicalKey,
      wire: found.wire,
      bestEffort: true,
      prepare: () =>
        chain(writeBackForm(mode, entry, value), (form) => {
          if (form.kind === "ready") {
            newWire = form.wire;

            return true;
          }

          remember();
          report(form.error);

          return false;
        }),
      carryOut: (repairIo): MaybePromise<void> =>
        chain(repairIo.set(entry.physicalKey, newWire), () => tidy(repairIo)),
      onFailure: remember,
    };
  }

  function answerFailure(
    mode: ExecutionMode,
    entry: EntryContext,
    located: EntryContext,
    decoded: FailedDecode,
    wire: unknown,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<ReadOutcome> {
    return chain(attemptRecover(mode, entry, located, decoded, report), (recovered) =>
      recovered === undefined
        ? applyPolicy(mode, entry, located, decoded, wire, perCall)
        : {
            value: recovered.value,
            wire,
            /* Under an old name, only that name: one tried later may still hold something better than a salvage. */
            repair: writeBack(
              mode,
              entry,
              { physicalKey: located.physicalKey, wire },
              recovered.value,
              (repairIo) =>
                located.physicalKey === entry.physicalKey
                  ? undefined
                  : ignoreFailure(() => repairIo.remove(located.physicalKey)),
            ),
          },
    );
  }

  function applyPolicy(
    mode: ExecutionMode,
    entry: EntryContext,
    located: EntryContext,
    decoded: FailedDecode,
    wire: unknown,
    perCall: OnInvalid<unknown> | undefined,
  ): MaybePromise<ReadOutcome> {
    report(decoded.error);

    const policy = resolveOnInvalid(perCall, entry.definition.onInvalid, options.onInvalid);
    const context = invalidContext(entry, located.physicalKey, decoded);
    const protectedData = cannotBeJudged(decoded);

    let repair: Repair | undefined;

    const value = applyInvalidPolicy(policy, context, {
      remove: () => {
        if (protectedData) return;

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

    return chain(value, (resolved) => ({
      value: resolved,
      repair,
      wire,
      refusal: protectedData ? decoded.error : undefined,
    }));
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
        if (decoded.kind === "invalid" || decoded.kind === "newer") {
          return answerFailure(mode, entry, located, decoded, wire, perCall);
        }

        if (decoded.kind === "missing") {
          return chain(resolveMissing(entry, mode), (value) => ({
            value,
            repair: undefined,
            wire,
          }));
        }

        if (decoded.behind) {
          /* The new form replaces the old one, rather than a copy of it moving, because the old one is exactly what is out of date. */
          return {
            value: decoded.value,
            wire,
            repair: writeBack(mode, entry, { physicalKey, wire }, decoded.value, (repairIo) =>
              physicalKey === entry.physicalKey ? undefined : sweep(repairIo, entry),
            ),
          };
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

    const land = (): MaybePromise<void> =>
      chain(repair.prepare?.() ?? true, (ready) =>
        ready
          ? chain(stillHolds(atomicIo, entry, repair), (holds) =>
              holds ? repair.carryOut(atomicIo) : undefined,
            )
          : undefined,
      );

    const attempt = (): MaybePromise<void> =>
      mode === "sync" ? land() : queue.run(entry.key, land);

    return chain(
      repair.bestEffort ? ignoreFailure(attempt, repair.onFailure) : attempt(),
      () => value,
    );
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

    Refused where the read could only stand in for the stored data, because the write would then replace that data with something worked out from a default.
  */
  function runUpdate(
    io: StorageIo,
    mode: ExecutionMode,
    key: string,
    updater: (current: never) => unknown,
  ): MaybePromise<void> {
    const entry = entryFor(key);

    return inTurn(mode, key, () =>
      chain(read(io, mode, entry, undefined), ({ value, wire, refusal }) => {
        if (refusal !== undefined) throw refusal;

        return writeValue(io, mode, entry, updater(copyValue(value) as never), {
          known: true,
          wire,
        });
      }),
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
