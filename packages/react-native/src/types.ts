/**
 * The part of AsyncStorage this package uses.
 *
 * Declared structurally, and supplied by the application rather than imported here, so this package never pulls in a native module. That keeps it loadable under a test runner or on a server, and leaves the door open for any compatible backend an app already uses.
 */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Optional, so a storage without it still qualifies. The adapter can list keys only when this is present. */
  getAllKeys?(): Promise<ReadonlyArray<string>>;
  /** AsyncStorage 3 reads several names in one call. A missing name answers `null`. */
  getMany?(keys: Array<string>): Promise<Record<string, string | null>>;
  /** AsyncStorage 3 writes several names in one call. */
  setMany?(entries: Record<string, string>): Promise<void>;
  /** AsyncStorage 3 removes several names in one call. */
  removeMany?(keys: Array<string>): Promise<void>;
  /** AsyncStorage 2 reads several names in one call, as pairs. A missing name answers `null`. */
  multiGet?(keys: Array<string>): Promise<ReadonlyArray<readonly [string, string | null]>>;
  /** AsyncStorage 2 writes several names in one call, as pairs. */
  multiSet?(pairs: Array<[string, string]>): Promise<void>;
  /** AsyncStorage 2 removes several names in one call. */
  multiRemove?(keys: Array<string>): Promise<void>;
}
