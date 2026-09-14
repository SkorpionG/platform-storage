"use client";

import { Badge, Card, Code, Value } from "@examples/ui";

import { useHydrated } from "../hooks/use-hydrated";
import { useStoredValue } from "../hooks/use-storage";
import { readDeclared } from "../store/snapshot";
import { local } from "../store/storage";

/** What `getSync` can and cannot do for a server-rendered first paint, with the three values that answer it side by side. */
export function HydrationPanel() {
  const hydrated = useHydrated();
  const declared = readDeclared(local, "theme");
  const stored = useStoredValue(local, "theme");

  return (
    <Card
      title="A synchronous read, across the hydration boundary"
      description="A server cannot know what this browser stored, so the markup it sends is the schema's own answer. React is told as much, renders the same thing on the first pass, and swaps in the stored value immediately afterwards."
      aside={
        <Badge tone={hydrated ? "success" : "neutral"}>
          {hydrated ? "hydrated" : "server HTML"}
        </Badge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-soft">the server sent</div>
          <div className="mt-1.5">
            <Value value={declared} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            An empty backend, read through the same schema. Identical on both sides by construction.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-soft">what is stored</div>
          <div className="mt-1.5">
            <Value value={stored} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            The declared value during hydration, the stored one from the moment it ends.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-soft">did it swap</div>
          <div className="mt-1.5">
            <Badge tone={declared === stored ? "neutral" : "info"}>
              {declared === stored ? "nothing to swap" : "swapped after hydration"}
            </Badge>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            Set a theme below and reload to make the two disagree.
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        This is the honest version of the claim. <Code>getSync</Code> does not abolish the flash
        under server rendering, because no server can know what a particular browser stored. What it
        removes is the machinery: no promise, no effect, and no loading state to hold, just one
        synchronous swap the instant hydration is over.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        The badge in the corner is the same mechanism describing itself:{" "}
        <Code>useSyncExternalStore</Code> with a server snapshot of <Code>false</Code> and a client
        snapshot of <Code>true</Code>, which is exactly the shape the value read above uses.
      </p>
    </Card>
  );
}
