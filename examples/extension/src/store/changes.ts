import { appSchema } from "@examples/schema";
import type { AppDefinition, AppKey } from "@examples/schema";
import type { PlatformStorage } from "@platform-storage/webextension";
import { notifyStorageChanged } from "@platform-storage/react";
import { browser } from "wxt/browser";

import { local, session, sync } from "./storages";

/**
 * The bridge from the browser's own change feed to the hooks.
 *
 * `ROADMAP.md` defers change subscription, so a storage reports only the writes made through it: without this, a value written in the options page would not move in the popup. `notifyStorageChanged` exists for exactly this, and when the library grows a real subscription this module is what it replaces.
 */

/** Physical key back to logical, so a change event can name the key the hooks know rather than the one the area holds. */
const LOGICAL: ReadonlyMap<string, AppKey> = new Map(
  appSchema.keys.map((key) => [appSchema.physicalKeys[key], key]),
);

/* Keyed by the browser's own area names. `managed` is reported too and no storage here covers it, so the lookup answering with nothing is the guard. */
const AREA_STORAGES: Readonly<Record<string, PlatformStorage<AppDefinition>>> = {
  local,
  sync,
  session,
};

/** One change the browser reported, as the panel wants to show it. */
export interface ObservedChange {
  readonly area: string;
  readonly physicalKey: string;
  /** Absent where the change is to a key this schema never declared. */
  readonly key: AppKey | undefined;
  readonly at: number;
}

/* Held rather than rebuilt, because `useSyncExternalStore` compares snapshots by identity and a fresh object every read never settles. */
let latest: ObservedChange | undefined;
const listeners = new Set<() => void>();

export function subscribeToObservedChanges(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getObservedChange(): ObservedChange | undefined {
  return latest;
}

function handle(changes: Record<string, unknown>, area: string): void {
  const storage = AREA_STORAGES[area];
  if (storage === undefined) return;

  for (const physicalKey of Object.keys(changes)) {
    const key = LOGICAL.get(physicalKey);

    /* A key the schema never declared still belongs on screen, because the inspector shows the whole area. Notifying without one wakes every reader of that storage, which is what `clear()` does too. */
    notifyStorageChanged(storage, key);

    latest = { area, physicalKey, key, at: Date.now() };
  }

  for (const listener of listeners) listener();
}

/**
 * Starts relaying `storage.onChanged` into the hooks, and answers with the way to stop.
 *
 * Every context runs its own copy, and a context hears its own writes back through it as well as the other contexts'. That costs one extra read of a value already in hand, and is what keeps the relay from having to know who wrote.
 */
export function startChangeBridge(): () => void {
  /*
    The feed is looked for rather than assumed, for the same reason the library's own adapter resolves its backend on every operation: a page can load before the extension API has arrived, and one opened outside an extension never gets one at all. A relay with nothing to relay is not a failure, so it starts and stops like any other.
  */
  const changed = browser?.storage?.onChanged;

  if (changed === undefined) return () => {};

  changed.addListener(handle);

  return () => {
    changed.removeListener(handle);
  };
}
