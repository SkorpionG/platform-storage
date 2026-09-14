"use client";

import { Badge, Value } from "@examples/ui";

import { useStoredValue } from "../hooks/use-storage";
import { local } from "../store/storage";

/** The reads the server column makes, made again once this is running in a browser. */
export function BrowserColumn() {
  const theme = useStoredValue(local, "theme");
  const recentSearches = useStoredValue(local, "recentSearches");
  const user = useStoredValue(local, "user");

  return (
    <div className="rounded-lg border border-line bg-inset p-3">
      <div className="flex items-center gap-2">
        <Badge tone="success">in this browser</Badge>
        <span className="text-xs text-muted">window.localStorage</span>
      </div>

      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="text-[11px] text-faint">theme</dt>
          <dd>
            <Value value={theme} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-faint">recentSearches</dt>
          <dd>
            <Value value={recentSearches} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-faint">user</dt>
          <dd>
            <Value value={user} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
