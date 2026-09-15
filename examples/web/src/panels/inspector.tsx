"use client";

import { Badge, Card } from "@examples/ui";
import { useSyncExternalStore } from "react";

import { getOriginServerSnapshot, getOriginSnapshot, subscribeToOrigin } from "../store/origin";

export function Inspector() {
  const entries = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getOriginServerSnapshot,
  );

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
