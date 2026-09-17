import { appSchema, DECLARED_DEFAULTS } from "@examples/schema";
import type { AppDefinition } from "@examples/schema";
import { recordStorageError } from "@platform-storage/react";
import { createReactNativeStorage } from "@platform-storage/react-native";
import type { AsyncStorageLike, PlatformStorage } from "@platform-storage/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/*
  Every storage here is a `PlatformStorage` rather than a `SyncPlatformStorage`. AsyncStorage only ever answers later, so the adapter exposes no synchronous half and neither does anything built on it. That is the single largest difference from the web examples, and it reaches every panel.

  Note what is missing: there is no resolution step. The extension package looks for `browser` and then `chrome` on every operation, because an extension API may not have arrived yet. Here the instance is an argument, which is why this library imports no native module and stays loadable under a test runner.
*/

/** The one the whole app reads. */
export const local: PlatformStorage<AppDefinition> = createReactNativeStorage({
  schema: appSchema,
  asyncStorage: AsyncStorage,
  onError: recordStorageError,
});

/**
 * The same device storage, read through a storage-level callback policy.
 *
 * A callback is the fourth thing `onInvalid` accepts, and it is declared here rather than per call because the storage-level layer is typed against `unknown`, so one function can serve every key. Per call the return is checked against the single key being read, which is stricter and the better choice when the key is known.
 */
export const recovering: PlatformStorage<AppDefinition> = createReactNativeStorage({
  schema: appSchema,
  asyncStorage: AsyncStorage,
  onError: recordStorageError,
  onInvalid: (context) => DECLARED_DEFAULTS[context.key],
});

/** A device whose storage refuses every call, which is what the native module does when the disk is full or the database will not open. Shaped after the `rejectingAsyncStorage` fake the package's own tests use. */
const refusing: AsyncStorageLike = {
  getItem: () => Promise.reject(new Error("the device refused to read")),
  setItem: () => Promise.reject(new Error("the device refused to write")),
  removeItem: () => Promise.reject(new Error("the device refused to remove")),
};

/**
 * A storage over that refusal, for the panel showing what a failing backend does.
 *
 * Anything it rejects with reaches the caller as `StorageAdapterError` carrying the original as its `cause`, never softened into a fallback: the invalid-data policy governs data that parsed and failed validation, not a backend that would not answer.
 */
export const failing: PlatformStorage<AppDefinition> = createReactNativeStorage({
  schema: appSchema,
  asyncStorage: refusing,
  name: "AsyncStorage (refusing)",
  onError: recordStorageError,
});
