import { storedNamesOf } from "@examples/schema";
import { subscribeToStorage } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";

import { adopting, local, teamA, teamB } from "./storage";

/* Every storage on this page that stores in `localStorage`, so the inspector can tell their names from anything else on the origin. */
const OURS = storedNamesOf([local, teamA, teamB, adopting]);

export interface OriginEntry {
  readonly key: string;
  readonly raw: string;
  readonly ours: boolean;
}

/* A server reaches no origin at all, and the browser's first pass has to print what the server did. One frozen array rather than a fresh one, so the snapshot holds still. */
const NOTHING: ReadonlyArray<OriginEntry> = Object.freeze([]);

function readOrigin(): ReadonlyArray<OriginEntry> {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return NOTHING;

  return (adapter.keysSync?.() ?? [])
    .map((key) => ({
      key,
      raw: String(adapter.getSync(key) ?? ""),
      ours: OURS.has(key),
    }))
    .toSorted((left, right) => left.key.localeCompare(right.key));
}

/*
  This panel reads the whole origin, including keys the schema never declared, so no value hook can serve it: it follows every storage on the origin as a whole and keeps its own snapshot.

  Cached against a counter of its own rather than re-read on every render, for the same reason a value read is: `useSyncExternalStore` compares snapshots by identity, and a fresh array every time never settles.
*/
let version = 0;
let cached: { readonly version: number; readonly entries: ReadonlyArray<OriginEntry> } | undefined;

/* Every storage it covers, because a change is announced only to listeners of the storage that made it, and a write through one prefixed storage would otherwise leave the snapshot cached from before. */
export function subscribeToOrigin(listener: () => void): () => void {
  const changed = (): void => {
    version += 1;
    listener();
  };
  const stops = [
    subscribeToStorage(local, changed),
    subscribeToStorage(teamA, changed),
    subscribeToStorage(teamB, changed),
    subscribeToStorage(adopting, changed),
  ];

  return () => {
    for (const stop of stops) stop();
  };
}

export function getOriginSnapshot(): ReadonlyArray<OriginEntry> {
  if (cached !== undefined && cached.version === version) return cached.entries;

  const entries = readOrigin();
  cached = { version, entries };

  return entries;
}

export function getOriginServerSnapshot(): ReadonlyArray<OriginEntry> {
  return NOTHING;
}
