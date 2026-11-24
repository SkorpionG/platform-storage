import { appSchema } from "@examples/schema";
import { Badge, Button, Card, Code, Field } from "@examples/ui";
import { useAsyncStorageValues } from "@platform-storage/react";
import { isPlatformStorageError } from "@platform-storage/webextension";
import { useState } from "react";

import { NotReady } from "../async-value";
import { areaCalls, countedSync, sync } from "../store/storages";

interface Outcome {
  readonly tone: "info" | "danger";
  readonly label: string;
}

/* Run one operation from a clean count, and answer with how many area calls it took, or what went wrong. */
async function counting(run: () => Promise<unknown>): Promise<Outcome> {
  areaCalls.count = 0;

  try {
    await run();

    return {
      tone: "info",
      label: `${String(areaCalls.count)} area ${areaCalls.count === 1 ? "call" : "calls"}`,
    };
  } catch (error) {
    return {
      tone: "danger",
      label: isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
    };
  }
}

const RUNS = {
  "one at a time": () => Promise.all(appSchema.keys.map((key) => countedSync.get(key))),
  "all at once": () => countedSync.getMany(appSchema.keys),
  "write two at once": () => countedSync.setMany({ theme: "dark", fontScale: 1.25 }),
  "remove two at once": () => countedSync.removeMany(["theme", "fontScale"]),
} as const;

type RunName = keyof typeof RUNS;

/* Over `sync` rather than the counted storage, so that its reads never land inside a run the panel is counting. Both are the same area, so a write from the buttons below shows up here. */
function LiveRead() {
  const [result] = useAsyncStorageValues(sync, ["theme", "fontScale"]);

  if (result.status !== "ready") return <NotReady stored={result} />;

  return (
    <Badge tone="info">
      {result.values.theme} · {result.values.fontScale}×
    </Badge>
  );
}

export function BatchPanel() {
  const [outcomes, setOutcomes] = useState<Partial<Record<RunName, Outcome>>>({});

  const run = (name: RunName): void => {
    void counting(RUNS[name]).then((outcome) => {
      setOutcomes((current) => ({ ...current, [name]: outcome }));
    });
  };

  const show = (name: RunName) => {
    const outcome = outcomes[name];

    return outcome === undefined ? (
      <span className="text-xs text-faint">not run</span>
    ) : (
      <Badge tone={outcome.tone}>{outcome.label}</Badge>
    );
  };

  return (
    <Card
      title="Several keys in one call"
      lead="Read every key one at a time, then all at once, and compare how many calls each took."
      how={
        <>
          <p>
            The sync area limits how often it may be written, and every call crosses into the
            browser. <Code>getMany</Code>, <Code>setMany</Code> and <Code>removeMany</Code> reach it
            once for any number of keys, and each key still reads exactly as <Code>get</Code> would.
          </p>
          <p>
            <Code>setMany</Code> validates every value before writing any of them.{" "}
            <Code>useAsyncStorageValues</Code> reads its keys in one call too, and again in one call
            whenever either changes, here or in another context.
          </p>
        </>
      }
    >
      <div className="divide-y divide-line">
        <Field
          label="Follow two keys through one hook"
          hint={
            <>
              <Code>useAsyncStorageValues(sync, [&quot;theme&quot;, &quot;fontScale&quot;])</Code>
            </>
          }
        >
          <LiveRead />
        </Field>

        <Field
          label="Read every key, one at a time"
          hint={
            <>
              <Code>get(key)</Code> for each of the {appSchema.keys.length} keys
            </>
          }
        >
          <Button onClick={() => run("one at a time")}>Read</Button>
          {show("one at a time")}
        </Field>

        <Field label="Read every key at once" hint={<Code>getMany(keys)</Code>}>
          <Button onClick={() => run("all at once")}>Read</Button>
          {show("all at once")}
        </Field>

        <Field
          label="Write two keys at once"
          hint={<Code>setMany(&#123; theme: &quot;dark&quot;, fontScale: 1.25 &#125;)</Code>}
        >
          <Button onClick={() => run("write two at once")}>Write</Button>
          {show("write two at once")}
        </Field>

        <Field
          label="Remove the same two at once"
          hint={<Code>removeMany([&quot;theme&quot;, &quot;fontScale&quot;])</Code>}
        >
          <Button onClick={() => run("remove two at once")}>Remove</Button>
          {show("remove two at once")}
        </Field>
      </div>
    </Card>
  );
}
