"use client";

import { Button, Card, Code, Value } from "@examples/ui";
import { useStorageValues } from "@platform-storage/react";

import { local } from "../store/storage";

/** The keys the hook reads, in the order the card lists them. */
const KEYS = ["displayName", "theme", "fontScale", "visitCount"] as const;

export function SummaryPanel() {
  const [values, writer] = useStorageValues(local, KEYS);
  const { displayName, theme, fontScale, visitCount } = values;

  return (
    <Card
      title="Several keys through one hook"
      lead="One hook reads these four keys as one object. Change any of them on this tab or in another, and the object follows."
      how={
        <>
          <p>
            The hook re-renders when any of its four keys changes, and for nothing else.{" "}
            <Code>writer.set</Code> takes any of the four and writes them in one{" "}
            <Code>setMany</Code>, validating every value before writing any.{" "}
            <Code>writer.remove()</Code> removes every key the hook reads, so each one reads as its
            default again.
          </p>
        </>
      }
    >
      <Code className="block w-fit">
        useStorageValues(local, [{KEYS.map((key) => `"${key}"`).join(", ")}])
      </Code>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-inset px-3 py-2 text-xs">
        {KEYS.map((key) => (
          <div key={key} className="contents">
            <dt className="font-mono text-soft">{key}</dt>
            <dd>
              <Value value={values[key]} />
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-sm leading-relaxed">
        <span className="text-xs text-soft">Rendered from it: </span>
        <output aria-label="Summary">
          {displayName ?? "Someone"} reads in {theme} at {Math.round(fontScale * 100)}%, and has
          visited {visitCount} {visitCount === 1 ? "time" : "times"}.
        </output>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => writer.set({ theme: "dark", fontScale: 1.25 })}>
          writer.set(&#123; theme: &quot;dark&quot;, fontScale: 1.25 &#125;)
        </Button>
        <Button tone="danger" onClick={() => writer.remove()}>
          writer.remove()
        </Button>
      </div>
    </Card>
  );
}
