import { Badge, Card, formatValue, Select } from "@examples/ui";
import { EXTENSION_STORAGE_AREA } from "@platform-storage/extension";
import type { ExtensionStorageAreaName } from "@platform-storage/extension";
import { useState } from "react";

import { useAreaContents } from "../hooks/use-area-contents";

const AREAS: ReadonlyArray<{ readonly value: ExtensionStorageAreaName; readonly label: string }> =
  Object.values(EXTENSION_STORAGE_AREA).map((value) => ({ value, label: `storage.${value}` }));

export function Inspector() {
  const [area, setArea] = useState<ExtensionStorageAreaName>(EXTENSION_STORAGE_AREA.Local);
  const { entries, failure } = useAreaContents(area);

  return (
    <Card
      title="What the area actually holds"
      description="The raw area, unmediated. These are values rather than text: an extension area transports JSON natively, so the library hands them over untouched."
      aside={<Badge>{entries.length} keys</Badge>}
    >
      {/* Beside the list rather than in the card header, because the side column is too narrow to hold a control and a title on one line. */}
      <div className="mb-3">
        <Select label="Area" value={area} options={AREAS} onChange={setArea} />
      </div>

      {failure === undefined ? null : (
        <p className="mb-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-300">
          {failure}
        </p>
      )}

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

      <p className="mt-3 text-xs leading-relaxed text-soft">
        This reads past the library on purpose, the same way devtools would. It is also the one
        thing on the page that cannot use a value hook: it follows the whole area rather than one
        declared key, and an area answers with a promise.
      </p>
    </Card>
  );
}
