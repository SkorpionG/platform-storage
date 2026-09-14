"use client";

import { Badge, Button, Card } from "@examples/ui";
import type { BadgeTone } from "@examples/ui";
import { STORAGE_ERROR_CODE } from "@platform-storage/web";
import { useSyncExternalStore } from "react";

import { clearLog, getLog, getServerLog, subscribeToLog } from "../store/log";

function toneFor(code: string): BadgeTone {
  if (code === STORAGE_ERROR_CODE.Validation || code === STORAGE_ERROR_CODE.Serialization) {
    return "warning";
  }
  if (code === STORAGE_ERROR_CODE.Unavailable || code === STORAGE_ERROR_CODE.Adapter) {
    return "danger";
  }
  return "neutral";
}

export function EventLog() {
  const entries = useSyncExternalStore(subscribeToLog, getLog, getServerLog);

  return (
    <Card
      title="Every failure, including the handled ones"
      description="The onError observer sees each failure whichever policy runs, which is what keeps a falling-back read from being a silent one."
      aside={
        entries.length === 0 ? null : (
          <Button onClick={clearLog} title="Clear the log">
            Clear
          </Button>
        )
      }
    >
      {entries.length === 0 ? (
        <p className="text-xs text-faint">
          Nothing has failed yet. Plant a corrupt value and read it back.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-line bg-inset p-2">
              <div className="flex items-center gap-2">
                <Badge tone={toneFor(entry.code)}>{entry.code}</Badge>
                {entry.count === 1 ? null : <Badge>×{entry.count}</Badge>}
                <span className="text-[11px] text-faint">{entry.at}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{entry.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
