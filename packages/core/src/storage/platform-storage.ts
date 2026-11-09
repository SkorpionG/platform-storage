import type { StorageAdapter, SyncStorageAdapter, WireOf } from "../adapter/adapter";
import type { PlatformStorageError } from "../errors/errors";
import type { GetResult, KeyOf, SetValue } from "../schema/key-definition";
import type { StorageSchema, StorageSchemaDefinition } from "../schema/storage-schema";
import type { Serializer } from "../serializer/serializer";
import type { OnInvalid } from "./invalid-policy";

/** What a single `get` accepts, on top of the key. */
export interface GetOptions<Definition> {
  /**
   * Overrides the key's and the storage's policy for this read alone.
   *
   * A callback given here is checked against what the key can hold, because nothing is being inferred at a call site the way it is in a schema declaration.
   */
  readonly onInvalid?: OnInvalid<GetResult<Definition>> | undefined;
}

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
  set<Key extends KeyOf<Definition>>(key: Key, value: SetValue<Definition[Key]>): Promise<void>;
  /**
   * Works out the next value from the current one and stores it, as one step.
   *
   * Writes to a key made through this storage run one at a time, so two updates started together cannot lose one another. The guarantee ends at this storage: no backend offers an atomic update across tabs or extension contexts.
   *
   * Reads the way `get` does, so `updater` receives the default where nothing is stored. It receives its own copy, so it may change plain objects, arrays, dates, maps and sets in place. Anything else, such as a class instance, is handed over as it is.
   *
   * A throw from `updater` rejects and writes nothing, and a result that validation or serialization refuses leaves the stored value as it was.
   */
  update<Key extends KeyOf<Definition>>(
    key: Key,
    updater: (current: GetResult<Definition[Key]>) => SetValue<Definition[Key]>,
  ): Promise<void>;
  remove(key: KeyOf<Definition>): Promise<void>;
  /** Whether anything is stored, without validating it. */
  has(key: KeyOf<Definition>): Promise<boolean>;
  /**
   * Removes only the keys this schema declares, never anything else sharing the backend.
   *
   * A failure names the key it happened on and reports the `remove` operation, because that is what the backend refused. Nothing reports `clear`, which names the method rather than a call any adapter receives.
   */
  clear(): Promise<void>;

  /** The key the backend stores under, for tooling that has to address it directly. */
  physicalKey(key: KeyOf<Definition>): string;

  /**
   * Follows one key, with its previous and new values read as `get` would read them.
   *
   * Reports writes made through this storage and changes from other tabs or extension contexts. It cannot report a second storage over the same `localStorage` in one document, and a write of an identical value may or may not be reported.
   *
   * Invalid data arrives as a read would answer it, from an `onInvalid` callback or otherwise the fallback, with `onError` told. A watcher never writes, removes or throws.
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
  setSync<Key extends KeyOf<Definition>>(key: Key, value: SetValue<Definition[Key]>): void;
  updateSync<Key extends KeyOf<Definition>>(
    key: Key,
    updater: (current: GetResult<Definition[Key]>) => SetValue<Definition[Key]>,
  ): void;
  removeSync(key: KeyOf<Definition>): void;
  hasSync(key: KeyOf<Definition>): boolean;
  clearSync(): void;
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
