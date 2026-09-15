import { appSchema } from "@examples/schema";
import { subscribeToStorage } from "@platform-storage/react";

import { local } from "./storage";

export interface OriginEntry {
  readonly key: string;
  readonly raw: string;
  readonly ours: boolean;
}

/* A server reaches no origin at all, and the browser's first pass has to print what the server did. One frozen array rather than a fresh one, so the snapshot holds still. */
const NOTHING: ReadonlyArray<OriginEntry> = Object.freeze([]);

function readOrigin(): ReadonlyArray<OriginEntry> {
  const declared = new Set<string>(Object.values(appSchema.physicalKeys));
  const entries: Array<OriginEntry> = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key === null) continue;

    entries.push({
      key,
      raw: window.localStorage.getItem(key) ?? "",
      ours: declared.has(key),
    });
  }

  return entries.toSorted((left, right) => left.key.localeCompare(right.key));
}

/*
  This panel reads the whole origin, including keys the schema never declared, so no value hook can serve it: it follows the storage as a whole and keeps its own snapshot.

  Cached against a counter of its own rather than re-read on every render, for the same reason a value read is: `useSyncExternalStore` compares snapshots by identity, and a fresh array every time never settles.
*/
let version = 0;
let cached: { readonly version: number; readonly entries: ReadonlyArray<OriginEntry> } | undefined;

export function subscribeToOrigin(listener: () => void): () => void {
  return subscribeToStorage(local, () => {
    version += 1;
    listener();
  });
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
