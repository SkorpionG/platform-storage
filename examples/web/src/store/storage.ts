import { appSchema, DECLARED_DEFAULTS, scratchSchema } from "@examples/schema";
import type { AppDefinition, ScratchDefinition } from "@examples/schema";
import { recordStorageError } from "@platform-storage/react";
import { createLocalStorage, createSessionStorage, memoryAdapter } from "@platform-storage/web";
import type { SyncPlatformStorage } from "@platform-storage/web";

/**
 * The same schema over `localStorage`, falling back to memory for a render that has no `window`.
 *
 * The choice is made on first use and then kept, so a server reads memory and a browser reads the origin, and a value can never be written to one and read back from the other. Memory is named `server-memory`, so the pair's name says where it is used.
 */
export const local: SyncPlatformStorage<AppDefinition> = createLocalStorage({
  schema: appSchema,
  fallback: memoryAdapter({ name: "server-memory" }),
  onError: recordStorageError,
});

/** The same arrangement over `sessionStorage`. Neither storage knows about the other. */
export const session: SyncPlatformStorage<AppDefinition> = createSessionStorage({
  schema: appSchema,
  fallback: memoryAdapter({ name: "server-memory" }),
  onError: recordStorageError,
});

/**
 * The same `localStorage`, read through a storage-level callback policy.
 *
 * A callback is the fourth thing `onInvalid` accepts, and it is declared here rather than per call because the storage-level layer is typed against `unknown`, so one function can serve every key. Per call the return is checked against the single key being read, which is stricter and the better choice when the key is known.
 */
export const localRecovering: SyncPlatformStorage<AppDefinition> = createLocalStorage({
  schema: appSchema,
  fallback: memoryAdapter({ name: "server-memory" }),
  onError: recordStorageError,
  onInvalid: (context) => DECLARED_DEFAULTS[context.key],
});

/**
 * `localStorage` with no fallback, for the panel that shows what a storage without one does where there is no `window`.
 *
 * No `onError`, because on a server that observer is one module-level log shared by every request that happens to be rendering.
 */
export const unguardedLocal: SyncPlatformStorage<AppDefinition> = createLocalStorage({
  schema: appSchema,
});

function scratchStorage(
  prefix: string,
  readUnprefixed: boolean,
): SyncPlatformStorage<ScratchDefinition> {
  return createLocalStorage({
    schema: scratchSchema,
    fallback: memoryAdapter({ name: "server-memory" }),
    onError: recordStorageError,
    prefix,
    readUnprefixed,
  });
}

/** Team A's prefix, which the clear panel plants a leftover under. */
export const TEAM_A_PREFIX = "team-a:";

/** Two storages over one schema and one `localStorage`, each inside its own prefix, so neither sees or clears the other's values. */
export const teamA: SyncPlatformStorage<ScratchDefinition> = scratchStorage(TEAM_A_PREFIX, false);
export const teamB: SyncPlatformStorage<ScratchDefinition> = scratchStorage("team-b:", false);

/** A storage adopting a prefix: it moves a value stored under the bare name in under `app:` the first time it reads it. */
export const adopting: SyncPlatformStorage<ScratchDefinition> = scratchStorage("app:", true);
