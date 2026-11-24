"use client";

import { Badge, Card, Code, Value } from "@examples/ui";

import { useHydrated, useStorageValue } from "@platform-storage/react";
import { readDeclaredValue } from "@platform-storage/react/server";

import { local } from "../store/storage";

/** What `getSync` can and cannot do for a server-rendered first paint, with the three values that answer it side by side. */
export function HydrationPanel() {
  const hydrated = useHydrated();
  const declared = readDeclaredValue(local, "theme");
  const [stored] = useStorageValue(local, "theme");

  return (
    <Card
      title="A synchronous read, across the hydration boundary"
      lead="Set a theme on the Values tab, then reload: the server's answer is swapped for the stored one."
      how={
        <>
          <p>
            A server cannot know what this browser stored, so the markup it sends is the
            schema&rsquo;s own answer. React renders the same thing on the first pass and swaps in
            the stored value immediately afterwards.
          </p>
          <p>
            <Code>getSync</Code> does not abolish that swap, because no server can know what a
            particular browser stored. What it removes is the machinery: no promise, no effect and
            no loading state, just one synchronous swap the instant hydration is over.
          </p>
          <p>
            The badge in the corner is the same mechanism describing itself:{" "}
            <Code>useSyncExternalStore</Code> with a server snapshot of <Code>false</Code> and a
            client snapshot of <Code>true</Code>.
          </p>
        </>
      }
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
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-soft">what is stored</div>
          <div className="mt-1.5">
            <Value value={stored} />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-soft">did it swap</div>
          <div className="mt-1.5">
            <Badge tone={declared === stored ? "neutral" : "info"}>
              {declared === stored ? "nothing to swap" : "swapped after hydration"}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
