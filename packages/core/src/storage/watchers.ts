import type { AdapterChange, AdapterSubscription, StorageAdapter } from "../adapter/adapter";
import { STORAGE_OPERATION } from "../errors/codes";
import { StorageAdapterError } from "../errors/errors";
import type { PlatformStorageError } from "../errors/errors";
import { isPlatformStorageError } from "../errors/guards";
import type { MaybePromise } from "../types/utils";
import { copyValue } from "./copy-value";
import { chain, isPromiseLike } from "./maybe-promise";

/** What was stored before a write, where that could be found out. */
export type PreviousWire =
  | { readonly known: true; readonly wire: unknown }
  | { readonly known: false };

/** A change as `watch` delivers it. The value types are applied by the storage, which knows the key. */
interface WatchedChange {
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly oldValueKnown: boolean;
}

type WatchListener = (change: WatchedChange) => void;
type ChangeListener = (key: string | undefined) => void;

/** What the watchers need from the storage they serve. */
export interface WatcherDependencies {
  readonly adapter: StorageAdapter<unknown>;
  /** Stored name to logical key, covering current names only. */
  readonly owners: ReadonlyMap<string, string>;
  readonly report: (error: PlatformStorageError) => PlatformStorageError;
  /** What a read of this wire value would answer with. Reports what is invalid and never throws for it. */
  decode(key: string, wire: unknown): MaybePromise<unknown>;
  /** What the key reads as now, without changing anything stored. */
  readCurrent(key: string): MaybePromise<unknown>;
}

/** Everything a storage holds about who is listening. */
export interface Watchers {
  watch(key: string, listener: WatchListener): () => void;
  onChange(listener: ChangeListener): () => void;
  /** Whether the storage has to announce its own writes, which nobody needs where nobody listens or the backend reports them already. */
  announcesWrites(): boolean;
  isListening(): boolean;
  /** Whether a write to this key has to find out what it is replacing. */
  needsPrevious(key: string): boolean;
  wrote(key: string, previous: PreviousWire, newWire: unknown): void;
}

/** Builds the listeners for one storage. It reaches the backend only while someone is listening. */
export function createWatchers(dependencies: WatcherDependencies): Watchers {
  const { adapter, owners, report, decode, readCurrent } = dependencies;
  const byKey = new Map<string, Set<WatchListener>>();
  const anyChange = new Set<ChangeListener>();
  const outbox: Array<() => MaybePromise<void>> = [];
  let delivering = false;
  let subscription: AdapterSubscription | undefined;

  /* Whatever the backend already reported has reached `onError`, so only something new is worth reporting. */
  function fail(cause: unknown): void {
    if (isPlatformStorageError(cause)) return;

    /* An `onError` that throws has nothing further to be told, and must not stop later changes from being delivered. */
    try {
      report(
        new StorageAdapterError({
          adapter: adapter.name,
          operation: STORAGE_OPERATION.Subscribe,
          cause,
        }),
      );
    } catch {
      return;
    }
  }

  function attempt(job: () => MaybePromise<void>): MaybePromise<void> {
    try {
      const result = job();

      return isPromiseLike(result) ? Promise.resolve(result).catch(fail) : result;
    } catch (cause) {
      fail(cause);

      return undefined;
    }
  }

  /* One at a time and in the order they arrived, so a listener that writes has its own change delivered after this one rather than in the middle of it. */
  function drain(): void {
    for (let job = outbox.shift(); job !== undefined; job = outbox.shift()) {
      const result = attempt(job);

      if (isPromiseLike(result)) {
        void Promise.resolve(result).then(drain);

        return;
      }
    }

    delivering = false;
  }

  /* A change's jobs all go in before any of them runs, so a listener that writes cannot get its own change ahead of the rest of this one. */
  function enqueue(jobs: ReadonlyArray<() => MaybePromise<void>>): void {
    outbox.push(...jobs);

    if (delivering) return;

    delivering = true;
    drain();
  }

  /* The recipients were fixed when the change arrived. Only those still subscribed are called, and each runs guarded, so one that throws cannot silence the rest. */
  function callEach<Listener>(
    recipients: ReadonlyArray<Listener>,
    isSubscribed: (listener: Listener) => boolean,
    call: (each: Listener) => void,
  ): void {
    for (const listener of recipients) {
      if (!isSubscribed(listener)) continue;

      attempt(() => {
        call(listener);
      });
    }
  }

  function deliver(
    key: string,
    recipients: ReadonlyArray<WatchListener>,
    oldValue: unknown,
    newValue: unknown,
    oldValueKnown: boolean,
  ): void {
    /* Each gets its own copy of the data, so that one changing what it was given cannot reach another listener or a declared default. */
    callEach(
      recipients,
      (listener) => byKey.get(key)?.has(listener) === true,
      (listener) => {
        listener({
          key,
          oldValue: copyValue(oldValue),
          newValue: copyValue(newValue),
          oldValueKnown,
        });
      },
    );
  }

  function recipientsOf(key: string): ReadonlyArray<WatchListener> {
    return Array.from(byKey.get(key) ?? []);
  }

  function announcement(key: string | undefined): () => void {
    const recipients = Array.from(anyChange);

    return () => {
      callEach(
        recipients,
        (listener) => anyChange.has(listener),
        (listener) => {
          listener(key);
        },
      );
    };
  }

  function changed(key: string, previous: PreviousWire, newWire: unknown): void {
    const recipients = recipientsOf(key);

    enqueue([
      announcement(key),
      (): MaybePromise<void> =>
        chain(decode(key, previous.known ? previous.wire : undefined), (oldValue) =>
          chain(decode(key, newWire), (newValue) => {
            deliver(key, recipients, oldValue, newValue, previous.known);
          }),
        ),
    ]);
  }

  /* Nothing says what a wholesale change replaced, so each watched key reads its new value and reports the old one as unknown. */
  function changedEverything(): void {
    enqueue([
      announcement(undefined),
      ...Array.from(byKey.keys(), (key) => {
        const recipients = recipientsOf(key);

        return (): MaybePromise<void> =>
          chain(decode(key, undefined), (oldValue) =>
            chain(readCurrent(key), (newValue) => {
              deliver(key, recipients, oldValue, newValue, false);
            }),
          );
      }),
    ]);
  }

  function fromBackend(change: AdapterChange<unknown>): void {
    if (change.key === undefined) {
      changedEverything();

      return;
    }

    const owner = owners.get(change.key);

    if (owner !== undefined)
      changed(owner, { known: true, wire: change.oldValue }, change.newValue);
  }

  /* Synchronous on purpose: a Manifest V3 service worker only wakes for listeners registered in its first turn. */
  function attach(): void {
    if (subscription !== undefined || adapter.subscribe === undefined) return;

    try {
      subscription = adapter.subscribe(fromBackend);
    } catch (cause) {
      fail(cause);
    }
  }

  function detachIfIdle(): void {
    if (byKey.size > 0 || anyChange.size > 0) return;

    subscription?.stop();
    subscription = undefined;
  }

  return {
    watch(key, listener) {
      /* Wrapped so that the same function watching twice is two watchers, each stopped on its own. */
      const entry: WatchListener = (change) => {
        listener(change);
      };
      const listeners = byKey.get(key) ?? new Set<WatchListener>();

      byKey.set(key, listeners);
      listeners.add(entry);
      attach();

      return () => {
        listeners.delete(entry);

        if (listeners.size === 0 && byKey.get(key) === listeners) byKey.delete(key);

        detachIfIdle();
      };
    },

    onChange(listener) {
      const entry: ChangeListener = (key) => {
        listener(key);
      };

      anyChange.add(entry);
      attach();

      return () => {
        anyChange.delete(entry);
        detachIfIdle();
      };
    },

    announcesWrites: () =>
      (byKey.size > 0 || anyChange.size > 0) && subscription?.reportsOwnWrites !== true,

    isListening: () => byKey.size > 0 || anyChange.size > 0,

    needsPrevious: (key) => byKey.has(key),

    wrote: changed,
  };
}
