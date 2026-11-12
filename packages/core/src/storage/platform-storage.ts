import type { StorageAdapter, SyncStorageAdapter, WireOf } from "../adapter/adapter";
import type { PlatformStorageError } from "../errors/errors";
import type { GetResult, KeyOf, SetValue } from "../schema/key-definition";
import type { StorageSchema, StorageSchemaDefinition } from "../schema/storage-schema";
import type { Serializer } from "../serializer/serializer";
import type { ClearTargets } from "./clear-targets";
import type { InvalidPolicy, OnInvalid } from "./invalid-policy";

/** What a single `get` accepts, on top of the key. */
export interface GetOptions<Definition> {
  /**
   * Overrides the key's and the storage's policy for this read alone.
   *
   * A callback given here is checked against what the key can hold, because nothing is being inferred at a call site the way it is in a schema declaration.
   */
  readonly onInvalid?: OnInvalid<GetResult<Definition>> | undefined;
}

/** What a single `getMany` accepts, on top of the keys. */
export interface GetManyOptions {
  /**
   * Overrides each key's and the storage's policy for this read alone.
   *
   * A named policy only: a callback is checked against what one key can hold, and these keys hold different things. Declare a callback on the key instead.
   */
  readonly onInvalid?: InvalidPolicy | undefined;
}

/**
 * What `getMany` answers with: each requested key, holding what `get` would answer for it.
 *
 * Typed from the keys given, so pass them as a literal list. A list typed more widely than what it holds, such as an `Array` of every key, claims keys the answer will not have.
 */
export type GetManyResult<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
> = {
  readonly [Each in Key]: GetResult<Definition[Each]>;
};

/** What `setMany` accepts: any of the declared keys, each with a value its schema accepts. */
export type SetManyValues<Definition extends StorageSchemaDefinition> = {
  readonly [Key in KeyOf<Definition>]?: SetValue<Definition[Key]>;
};

/** One change to a key, as `watch` delivers it. */
export interface StorageChange<Definition, Key extends string = string> {
  readonly key: Key;
  /** What the key read as before. A read of an empty key where `oldValueKnown` is `false`. */
  readonly oldValue: GetResult<Definition>;
  readonly newValue: GetResult<Definition>;
  /** `false` where nothing could say what was replaced, such as another tab clearing all of `localStorage`. */
  readonly oldValueKnown: boolean;
}

/** What {@link createStorage} accepts. */
export interface CreateStorageOptions<
  Definition extends StorageSchemaDefinition,
  Adapter extends StorageAdapter<unknown>,
> {
  readonly schema: StorageSchema<Definition>;
  readonly adapter: Adapter;
  /** Replaces the adapter's own serializer. Typed against what that adapter transports. */
  readonly serializer?: Serializer<WireOf<Adapter>> | undefined;
  /**
   * Put before every name this storage stores under, so it can share a backend without its names colliding.
   *
   * Taken literally, so `"app:"` stores `theme` as `app:theme` and the separator is yours to choose. A key's `readFrom` names take it too; a key declaring `prefixed: false` does not.
   */
  readonly prefix?: string | undefined;
  /**
   * Also tries each key's names without the prefix, after the prefixed ones, so a storage adopting a prefix moves its existing values across.
   *
   * Needs a `prefix`. Asking without one is refused when the storage is built rather than at compile time, so that this stays a type an interface can extend and a wrapper can `Omit` from.
   */
  readonly readUnprefixed?: boolean | undefined;
  /** The policy for every key that does not declare its own. Defaults to `"fallback"`. */
  readonly onInvalid?: OnInvalid<unknown> | undefined;
  /**
   * Called for every failure, whether it is thrown or handled.
   *
   * This is what keeps a falling-back read from being a silent one: wire it to a logger and stale data still shows up, without a read ever breaking the surface reading it.
   */
  readonly onError?: ((error: PlatformStorageError) => void) | undefined;
}

/**
 * A storage over one schema: the asynchronous half, which every backend can serve.
 *
 * Every method is typed against the schema, so the editor completes the keys and a wrong value is refused before it is written.
 */
export interface PlatformStorage<Definition extends StorageSchemaDefinition> {
  readonly schema: StorageSchema<Definition>;
  readonly adapter: StorageAdapter<unknown>;

  get<Key extends KeyOf<Definition>>(
    key: Key,
    options?: GetOptions<Definition[Key]>,
  ): Promise<GetResult<Definition[Key]>>;
  /**
   * Reads several keys, each exactly as `get` would, with one call to the backend for all of them.
   *
   * Every name the keys could be stored under, old names included, is fetched together, which matters most where each call is expensive: an extension's rate-limited `sync` area, or AsyncStorage's native bridge. A key's repairs still happen one at a time, each re-checking the backend first.
   *
   * A key listed twice is read once. An undeclared key throws before anything is read.
   */
  getMany<Key extends KeyOf<Definition>>(
    keys: ReadonlyArray<Key>,
    options?: GetManyOptions,
  ): Promise<GetManyResult<Definition, Key>>;
  set<Key extends KeyOf<Definition>>(key: Key, value: SetValue<Definition[Key]>): Promise<void>;
  /**
   * Writes several keys, each exactly as `set` would, with one call to the backend for all of them.
   *
   * Every value is validated before any is written, so one the schema refuses rejects the whole call and nothing changes. A key set to `undefined` is removed. The call holds every key's turn at once, so it waits for writes already started on any of them and later writes wait for it.
   *
   * A backend that fails partway through its own batch call cannot be undone.
   */
  setMany(values: SetManyValues<Definition>): Promise<void>;
  /**
   * Works out the next value from the current one and stores it, as one step.
   *
   * Writes to a key made through this storage run one at a time, so two updates started together cannot lose one another. The guarantee ends at this storage: no backend offers an atomic update across tabs or extension contexts.
   *
   * Reads the way `get` does, so `updater` receives the default where nothing is stored. It receives its own copy, so it may change plain objects, arrays, dates, maps and sets in place. Anything else, such as a class instance, is handed over as it is.
   *
   * A throw from `updater` rejects and writes nothing, and a result that validation or serialization refuses leaves the stored value as it was.
   *
   * Rejects without calling `updater` where a versioned key holds data from a newer version, or a migration step failed and `recover` could not repair the value, because the result would replace data this code cannot read.
   */
  update<Key extends KeyOf<Definition>>(
    key: Key,
    updater: (current: GetResult<Definition[Key]>) => SetValue<Definition[Key]>,
  ): Promise<void>;
  remove(key: KeyOf<Definition>): Promise<void>;
  /** Removes several keys, old names included, in one call to the backend where it has one. */
  removeMany(keys: ReadonlyArray<KeyOf<Definition>>): Promise<void>;
  /** Whether anything is stored, without validating it. */
  has(key: KeyOf<Definition>): Promise<boolean>;
  /**
   * Removes what the target names, in one call where the backend has a batch call. With no target, only the names this schema declares, never anything else sharing the backend.
   *
   * A target or a list of them reaches further, and anything wider than `declared` has to be asked for by name: `readFrom`, `unprefixed`, `undeclared`, or `everything` on its own. See {@link CLEAR_TARGET}.
   *
   * `undeclared` and `everything` list what the backend holds through the adapter's `keys`, and throw `StorageUnsupportedError` before removing anything where it has none. A name written between the listing and the removal survives. `unprefixed` on a storage with no prefix removes nothing and tells `onError`.
   *
   * A failure reports what the backend refused: `removeMany`, naming no single key, where it removed them together, `remove` and the name where it went one at a time, or `keys` where listing failed.
   */
  clear(target?: ClearTargets): Promise<void>;

  /** The name the backend stores this key under, the storage's `prefix` included, for tooling that has to address it directly. */
  physicalKey(key: KeyOf<Definition>): string;

  /**
   * Follows one key, with its previous and new values read as `get` would read them.
   *
   * Reports writes made through this storage and changes from other tabs or extension contexts. It cannot report a second storage over the same `localStorage` in one document, and a write of an identical value may or may not be reported.
   *
   * Invalid data arrives as a read would answer it, from `recover`, an `onInvalid` callback or otherwise the fallback, with `onError` told. A watcher never writes, removes or throws.
   *
   * A read saving a migration or a `recover` result is not a change, because the key's value has not moved, so it is not reported. One saved under a new name after being found under an old one can arrive as the key going from empty to its value.
   *
   * Each listener gets its own copy of plain objects, arrays, dates, maps and sets. Anything else, such as a class instance, is handed over as it is. A listener hears only changes that arrive after it started listening, and a write still under way when it starts counts.
   *
   * @returns Stops listening.
   */
  watch<Key extends KeyOf<Definition>>(
    key: Key,
    listener: (change: StorageChange<Definition[Key], Key>) => void,
  ): () => void;

  /**
   * Says which key changed, without reading anything, and `undefined` where anything may have.
   *
   * A read saving a migration or a `recover` result is not a change, so it is not reported.
   *
   * @returns Stops listening.
   */
  onChange(listener: (key: KeyOf<Definition> | undefined) => void): () => void;
}

/** The synchronous half, present only when the adapter can answer immediately. */
export interface SyncStorageMethods<Definition extends StorageSchemaDefinition> {
  getSync<Key extends KeyOf<Definition>>(
    key: Key,
    options?: GetOptions<Definition[Key]>,
  ): GetResult<Definition[Key]>;
  getManySync<Key extends KeyOf<Definition>>(
    keys: ReadonlyArray<Key>,
    options?: GetManyOptions,
  ): GetManyResult<Definition, Key>;
  setSync<Key extends KeyOf<Definition>>(key: Key, value: SetValue<Definition[Key]>): void;
  setManySync(values: SetManyValues<Definition>): void;
  updateSync<Key extends KeyOf<Definition>>(
    key: Key,
    updater: (current: GetResult<Definition[Key]>) => SetValue<Definition[Key]>,
  ): void;
  removeSync(key: KeyOf<Definition>): void;
  removeManySync(keys: ReadonlyArray<KeyOf<Definition>>): void;
  hasSync(key: KeyOf<Definition>): boolean;
  clearSync(target?: ClearTargets): void;
}

/** A storage whose backend can also answer immediately, so it carries `getSync` and its siblings as well. */
export type SyncPlatformStorage<Definition extends StorageSchemaDefinition> =
  PlatformStorage<Definition> & SyncStorageMethods<Definition>;

/** Which of the two storage shapes {@link createStorage} answers with, decided by whether the adapter can answer immediately. */
export type CreateStorageResult<
  Definition extends StorageSchemaDefinition,
  Adapter extends StorageAdapter<unknown>,
> =
  Adapter extends SyncStorageAdapter<unknown>
    ? SyncPlatformStorage<Definition>
    : PlatformStorage<Definition>;
