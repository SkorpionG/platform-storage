import { appSchema, DECLARED_DEFAULTS } from "@examples/schema";
import type { AppDefinition } from "@examples/schema";
import { createExtensionStorage } from "@platform-storage/extension";
import type { PlatformStorage } from "@platform-storage/extension";
import { recordStorageError } from "@platform-storage/react";

/*
  Every storage here is a `PlatformStorage` rather than a `SyncPlatformStorage`. An extension area only ever answers later, so the adapter exposes no synchronous half and neither does anything built on it. That is the single largest difference from the web examples, and it reaches every panel.
*/

/** The default area, and the one all three contexts read. */
export const local: PlatformStorage<AppDefinition> = createExtensionStorage({
  schema: appSchema,
  area: "local",
  onError: recordStorageError,
});

/** The same schema over the area the browser replicates between the user's signed-in profiles. Its quota is far smaller, which the quota panel is about. */
export const sync: PlatformStorage<AppDefinition> = createExtensionStorage({
  schema: appSchema,
  area: "sync",
  onError: recordStorageError,
});

/** The same schema again, over an area emptied when the browser closes. Absent on Manifest V2 and before Chrome 102 or Firefox 115, where addressing it reports itself rather than crashing. */
export const session: PlatformStorage<AppDefinition> = createExtensionStorage({
  schema: appSchema,
  area: "session",
  onError: recordStorageError,
});

/**
 * The same `local` area, read through a storage-level callback policy.
 *
 * A callback is the fourth thing `onInvalid` accepts, and it is declared here rather than per call because the storage-level layer is typed against `unknown`, so one function can serve every key. Per call the return is checked against the single key being read, which is stricter and the better choice when the key is known.
 */
export const localRecovering: PlatformStorage<AppDefinition> = createExtensionStorage({
  schema: appSchema,
  area: "local",
  onError: recordStorageError,
  onInvalid: (context) => DECLARED_DEFAULTS[context.key],
});

/**
 * A storage whose backend is never there, for the panel showing what a missing extension API does.
 *
 * The web examples have to hand their adapter a `Storage` that throws on access to arrange this. Here the backend source is an ordinary option, so answering with nothing is all it takes, and it is the same path a content script without the `storage` permission would take.
 */
export const detached: PlatformStorage<AppDefinition> = createExtensionStorage({
  schema: appSchema,
  storage: () => undefined,
  name: "storage.local (no extension API)",
});
