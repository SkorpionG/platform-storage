import { Badge, Button, Card } from "@examples/ui";
import type { BadgeTone } from "@examples/ui";
import { STORAGE_ERROR_CODE } from "@platform-storage/webextension";
import { clearStorageErrors, useStorageErrors } from "@platform-storage/react";

function toneFor(code: string): BadgeTone {
  if (code === STORAGE_ERROR_CODE.Validation || code === STORAGE_ERROR_CODE.Serialization) {
    return "warning";
  }
  if (
    code === STORAGE_ERROR_CODE.Quota ||
    code === STORAGE_ERROR_CODE.Unavailable ||
    code === STORAGE_ERROR_CODE.Unsupported ||
    code === STORAGE_ERROR_CODE.Adapter
  ) {
    return "danger";
  }
  return "neutral";
}

export function EventLog() {
  const entries = useStorageErrors();

  return (
    <Card
      title="Error log"
      lead="Every failure onError saw on this page, including the ones a fallback handled."
      how={
        <p>
          A browser refusing a write arrives here too. The log belongs to the page reading it: the
          popup and the background worker keep their own, so a failure there is not shown here.
        </p>
      }
      aside={
        entries.length === 0 ? null : (
          <Button onClick={clearStorageErrors} title="Clear the log">
            Clear
          </Button>
        )
      }
    >
      {entries.length === 0 ? (
        <p className="text-xs text-faint">
          Nothing has failed yet. Run the tour, or plant bad data on the Bad data tab.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-line bg-inset p-2">
              <div className="flex items-center gap-2">
                <Badge tone={toneFor(entry.error.code)}>{entry.error.code}</Badge>
                {entry.count === 1 ? null : <Badge>×{entry.count}</Badge>}
                <span className="text-[11px] text-faint">
                  {new Date(entry.at).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{entry.error.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
