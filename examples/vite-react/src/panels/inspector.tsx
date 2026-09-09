import { appSchema } from "@examples/schema";
import { Badge, Card } from "@examples/ui";
import { useSyncExternalStore } from "react";

import { getRevision, subscribeToRevision } from "../storage";

interface Entry {
  readonly key: string;
  readonly raw: string;
  readonly ours: boolean;
}

function readOrigin(): ReadonlyArray<Entry> {
  const declared = new Set<string>(Object.values(appSchema.physicalKeys));
  const entries: Array<Entry> = [];

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

export function Inspector() {
  useSyncExternalStore(subscribeToRevision, getRevision);
  const entries = readOrigin();

  return (
    <Card
      title="What is actually on the origin"
      description="Raw localStorage, unmediated. This is the text the library serialized, under the physical key it chose."
      aside={<Badge>{entries.length} keys</Badge>}
    >
      {entries.length === 0 ? (
        <p className="text-xs text-faint">Nothing stored yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.key} className="rounded-md border border-line bg-inset p-2">
              <div className="flex items-center gap-2">
                <Badge tone={entry.ours ? "info" : "neutral"}>{entry.key}</Badge>
                {entry.ours ? null : (
                  <span className="text-[11px] text-faint">not in the schema</span>
                )}
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-muted" title={entry.raw}>
                {entry.raw}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
