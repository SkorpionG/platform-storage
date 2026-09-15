import type { GetResult, PlatformStorageError, SetValue } from "@platform-storage/core";

/** What a key holds, and what to do about it. Both writers notify every hook reading that key. */
export interface SyncStorageWriter<Definition> {
  set(value: SetValue<Definition>): void;
  /** Deletes the stored value, so the key reads as its default again. Distinct from writing `undefined`, which a key with a default cannot express. */
  remove(): void;
}

/** The same pair over a storage that only answers later. Each promise settles exactly as the storage's own does, so a refused write is still a rejection. */
export interface AsyncStorageWriter<Definition> {
  set(value: SetValue<Definition>): Promise<void>;
  remove(): Promise<void>;
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
