import type {
  GetManyResult,
  GetResult,
  KeyOf,
  PlatformStorageError,
  SetManyValues,
  SetValue,
  StorageSchemaDefinition,
} from "@platform-storage/core";

/** What a key holds, and what to do about it. Every writer notifies each hook reading that key. */
export interface SyncStorageWriter<Definition> {
  set(value: SetValue<Definition>): void;
  /** Works out the next value from the current one, as one step. The updater receives its own copy, as the storage's `update` describes. */
  update(updater: (current: GetResult<Definition>) => SetValue<Definition>): void;
  /** Deletes the stored value, so the key reads as its default again. Distinct from writing `undefined`, which a key with a default cannot express. */
  remove(): void;
}

/** The same pair over a storage that only answers later. Each promise settles exactly as the storage's own does, so a refused write is still a rejection. */
export interface AsyncStorageWriter<Definition> {
  set(value: SetValue<Definition>): Promise<void>;
  update(updater: (current: GetResult<Definition>) => SetValue<Definition>): Promise<void>;
  remove(): Promise<void>;
}

/** Several keys' writer, limited to the keys its hook reads. Every write notifies each hook reading a key it touched. */
export interface SyncStorageValuesWriter<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
> {
  /** Writes any of the keys in one call, as the storage's `setMany` does: every value is validated before any is written, and a key set to `undefined` is removed. */
  set(values: Pick<SetManyValues<Definition>, Key>): void;
  /** Removes the keys given, or every key the hook reads when given none. */
  remove(keys?: ReadonlyArray<Key>): void;
}

/** The same over a storage that only answers later. Each promise settles exactly as the storage's own `setMany` and `removeMany` do. */
export interface AsyncStorageValuesWriter<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
> {
  set(values: Pick<SetManyValues<Definition>, Key>): Promise<void>;
  remove(keys?: ReadonlyArray<Key>): Promise<void>;
}

/** The three answers an asynchronous read can give, for comparing against without spelling the string. */
export const STORED_VALUE_STATUS = {
  Loading: "loading",
  Ready: "ready",
  Failed: "failed",
} as const;

/** One of {@link STORED_VALUE_STATUS}. */
export type StoredValueStatus = (typeof STORED_VALUE_STATUS)[keyof typeof STORED_VALUE_STATUS];

/**
 * A read from a storage that answers later.
 *
 * Discriminated on `status` rather than on `value`, because `"ready"` with a `value` of `undefined` is a real answer: it means the key holds nothing. Testing the value instead would collapse that into "still loading", which is the one distinction this library exists to keep.
 */
export type AsyncStoredValue<Definition> =
  | { readonly status: "loading"; readonly value: undefined; readonly error: undefined }
  | { readonly status: "ready"; readonly value: GetResult<Definition>; readonly error: undefined }
  | { readonly status: "failed"; readonly value: undefined; readonly error: PlatformStorageError };

/**
 * A read of several keys from a storage that answers later, all of them together.
 *
 * One status for the whole read, because the keys are fetched in one backend call that lands or fails as a whole. Discriminated on `status` for the same reason {@link AsyncStoredValue} is: `"ready"` with a key holding `undefined` is a real answer.
 */
export type AsyncStoredValues<
  Definition extends StorageSchemaDefinition,
  Key extends KeyOf<Definition>,
> =
  | { readonly status: "loading"; readonly values: undefined; readonly error: undefined }
  | {
      readonly status: "ready";
      readonly values: GetManyResult<Definition, Key>;
      readonly error: undefined;
    }
  | { readonly status: "failed"; readonly values: undefined; readonly error: PlatformStorageError };

/** One failure the storage reported, as the error itself rather than a copy of its fields. */
export interface StorageErrorEntry {
  /** Stable for as long as the entry lives, so it can key a list. */
  readonly id: number;
  readonly error: PlatformStorageError;
  /** How many times in a row this same failure arrived. */
  readonly count: number;
  /** When the most recent one arrived, in epoch milliseconds. Formatting it is the application's business. */
  readonly at: number;
}
