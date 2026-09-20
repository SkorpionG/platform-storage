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
