"use client";

import { Button, Card, Code } from "@examples/ui";
import { useStorageValues } from "@platform-storage/react";

import { local } from "../store/storage";

export function SummaryPanel() {
  const [{ displayName, theme, fontScale, visitCount }, writer] = useStorageValues(local, [
    "displayName",
    "theme",
    "fontScale",
    "visitCount",
  ]);

  return (
    <Card
      title="Several keys through one hook"
      description="One useStorageValues call reads four of the keys above as one object. It re-renders when any of the four changes, and for nothing else."
    >
      <p className="text-sm leading-relaxed">
        <output aria-label="Summary">
          {displayName ?? "Someone"} reads in {theme} at {Math.round(fontScale * 100)}%, and has
          visited {visitCount} {visitCount === 1 ? "time" : "times"}.
        </output>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => writer.set({ theme: "dark", fontScale: 1.25 })}>
          Dark and larger
        </Button>
        <Button tone="danger" onClick={() => writer.remove()}>
          Reset these four
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        <Code>writer.set</Code> writes two keys in one <Code>setMany</Code>, and{" "}
        <Code>writer.remove()</Code> removes every key the hook reads. Change a key above, or from
        another tab, and this line follows without reading anything it did not ask for.
      </p>
    </Card>
  );
}
