import { appSchema } from "@examples/schema";
import type { AppKey } from "@examples/schema";
import type { AdapterChange } from "@platform-storage/webextension";

import { local, session, sync } from "./storages";

/**
 * The browser's change feed, as the adapter reports it.
 *
 * The hooks follow changes by themselves. This reads the feed underneath them because the panel also shows keys no schema declares, which `watch` and `onChange` deliberately leave out.
 */

const AREAS = { local, sync, session } as const;

/** Each area's stored names back to logical keys, so a change can name the key the schema knows rather than the one the area holds. Asked of each storage, because its prefix is part of the name. */
const LOGICAL: Readonly<Record<string, ReadonlyMap<string, AppKey>>> = Object.fromEntries(
  Object.entries(AREAS).map(([area, storage]) => [
    area,
    new Map(appSchema.keys.map((key) => [storage.physicalKey(key), key])),
  ]),
);

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
let stops: ReadonlyArray<() => void> = [];

function record(area: string, change: AdapterChange<unknown>): void {
  if (change.key === undefined) return;

  latest = { area, physicalKey: change.key, key: LOGICAL[area]?.get(change.key), at: Date.now() };

  for (const listener of listeners) listener();
}

export function subscribeToObservedChanges(listener: () => void): () => void {
  listeners.add(listener);

  if (listeners.size === 1) {
    stops = Object.entries(AREAS).map(([area, storage]) => {
      const subscription = storage.adapter.subscribe?.((change) => {
        record(area, change);
      });

      return () => subscription?.stop();
    });
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size > 0) return;

    for (const stop of stops) stop();
    stops = [];
  };
}

export function getObservedChange(): ObservedChange | undefined {
  return latest;
}
