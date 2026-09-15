import { appSchema, DECLARED_DEFAULTS } from "@examples/schema";
import type { AppDefinition } from "@examples/schema";
import { recordStorageError } from "@platform-storage/react";
import {
  createLocalStorage,
  createStorage,
  localStorageAdapter,
  memoryAdapter,
  sessionStorageAdapter,
  withFallback,
} from "@platform-storage/web";
import type { SyncPlatformStorage } from "@platform-storage/web";

/**
 * The same schema over `localStorage`, paired with memory for a render that has no `window`.
 *
 * `withFallback` decides on first use and then keeps the decision, so a server reads memory and a browser reads the origin, and a value can never be written to one and read back from the other.
 */
export const local: SyncPlatformStorage<AppDefinition> = createStorage({
  schema: appSchema,
  adapter: withFallback(localStorageAdapter(), memoryAdapter({ name: "server-memory" })),
  onError: recordStorageError,
});

/** The same arrangement over `sessionStorage`. Neither storage knows about the other. */
export const session: SyncPlatformStorage<AppDefinition> = createStorage({
  schema: appSchema,
  adapter: withFallback(sessionStorageAdapter(), memoryAdapter({ name: "server-memory" })),
  onError: recordStorageError,
});

/**
 * The same `localStorage`, read through a storage-level callback policy.
 *
 * A callback is the fourth thing `onInvalid` accepts, and it is declared here rather than per call because the storage-level layer is typed against `unknown`, so one function can serve every key. Per call the return is checked against the single key being read, which is stricter and the better choice when the key is known.
 */
export const localRecovering: SyncPlatformStorage<AppDefinition> = createStorage({
  schema: appSchema,
  adapter: withFallback(localStorageAdapter(), memoryAdapter({ name: "server-memory" })),
  onError: recordStorageError,
  onInvalid: (context) => DECLARED_DEFAULTS[context.key],
});

/**
 * `localStorage` with nothing behind it, for the panel that shows what the unguarded pairing does where there is no `window`.
 *
 * No `onError`, because on a server that observer is one module-level log shared by every request that happens to be rendering.
 */
export const unguardedLocal: SyncPlatformStorage<AppDefinition> = createLocalStorage({
  schema: appSchema,
});
