import { appSchema } from "@examples/schema";

import { getRevision } from "./revision";

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

let cached: { readonly revision: number; readonly entries: ReadonlyArray<OriginEntry> } | undefined;

/** Everything on the origin, ours and otherwise. Cached against the revision for the same reason a value read is. */
export function getOriginSnapshot(): ReadonlyArray<OriginEntry> {
  const revision = getRevision();

  if (cached !== undefined && cached.revision === revision) return cached.entries;

  const entries = readOrigin();
  cached = { revision, entries };

  return entries;
}

export function getOriginServerSnapshot(): ReadonlyArray<OriginEntry> {
  return NOTHING;
}
