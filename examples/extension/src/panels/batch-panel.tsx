import { appSchema } from "@examples/schema";
import { Badge, Button, Card, Code, Field } from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/webextension";
import { useState } from "react";

import { areaCalls, countedSync } from "../store/storages";

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
      description="The sync area limits how often it may be written, and every call crosses into the browser. getMany, setMany and removeMany reach it once for any number of keys."
    >
      <div className="divide-y divide-line">
        <Field
          label="Read every key, one at a time"
          hint={
            <>
              <Code>get</Code> for each declared key, old names included.
            </>
          }
        >
          <Button onClick={() => run("one at a time")}>Read</Button>
          {show("one at a time")}
        </Field>

        <Field
          label="Read every key at once"
          hint={
            <>
              <Code>getMany</Code> over the same keys. Each one reads exactly as <Code>get</Code>{" "}
              would.
            </>
          }
        >
          <Button onClick={() => run("all at once")}>Read</Button>
          {show("all at once")}
        </Field>

        <Field
          label="Write two keys at once"
          hint={
            <>
              <Code>setMany</Code> validates both before writing either, then writes them together.
            </>
          }
        >
          <Button onClick={() => run("write two at once")}>Write</Button>
          {show("write two at once")}
        </Field>

        <Field
          label="Remove the same two at once"
          hint={
            <>
              <Code>removeMany</Code> removes both, and any old names they declare, together.
            </>
          }
        >
          <Button onClick={() => run("remove two at once")}>Remove</Button>
          {show("remove two at once")}
        </Field>
      </div>
    </Card>
  );
}
