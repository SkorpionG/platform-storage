/**
 * The part of AsyncStorage this package uses.
 *
 * Declared structurally, and supplied by the application rather than imported here, so this package never pulls in a native module. That keeps it loadable under a test runner or on a server, and leaves the door open for any compatible backend an app already uses.
 */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
