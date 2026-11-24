import { Alert, Badge, Card, formatValue, Select } from "@examples/ui";
import { WEB_EXTENSION_STORAGE_AREA } from "@platform-storage/webextension";
import type { WebExtensionStorageAreaName } from "@platform-storage/webextension";
import { useState } from "react";

import { useAreaContents } from "../hooks/use-area-contents";

const AREAS: ReadonlyArray<{
  readonly value: WebExtensionStorageAreaName;
  readonly label: string;
}> = Object.values(WEB_EXTENSION_STORAGE_AREA).map((value) => ({
  value,
  label: `storage.${value}`,
}));

export function Inspector() {
  const [area, setArea] = useState<WebExtensionStorageAreaName>(WEB_EXTENSION_STORAGE_AREA.Local);
  const { entries, failure } = useAreaContents(area);

  return (
    <Card
      title="What the area actually holds"
      lead="The raw area: values rather than text, under the names they are stored as."
      how={
        <p>
          An area transports JSON natively, so the library hands values over untouched. This lists
          the area through the adapter, below the schema, the way devtools would, and re-reads it on
          every change the browser reports.
        </p>
      }
      aside={<Badge>{`${String(entries.length)} ${entries.length === 1 ? "key" : "keys"}`}</Badge>}
    >
      {/* Beside the list rather than in the card header, because the side column is too narrow to hold a control and a title on one line. */}
      <div className="mb-3">
        <Select label="Area" value={area} options={AREAS} onChange={setArea} />
      </div>

      {failure === undefined ? null : <Alert className="mb-2">{failure}</Alert>}

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
              <div
                className="mt-1 truncate font-mono text-[11px] text-muted"
                title={formatValue(entry.value)}
              >
                {formatValue(entry.value)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
