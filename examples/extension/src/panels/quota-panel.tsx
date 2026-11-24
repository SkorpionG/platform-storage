import { Badge, Button, Card, Code, Field } from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/webextension";
import type { PlatformStorage } from "@platform-storage/webextension";
import type { AppDefinition } from "@examples/schema";
import { useState } from "react";

import { local, sync } from "../store/storages";

/* `storage.sync` allows 8192 bytes per item, counting the key. Forty terms of forty characters is comfortably past it, and nothing in the schema caps the length of this list. */
const OVERSIZED: ReadonlyArray<string> = Array.from(
  { length: 400 },
  (_unused, index) => `search term number ${index} ${"x".repeat(40)}`,
);

const MODEST: ReadonlyArray<string> = ["coffee", "tea", "tisane"];

interface Outcome {
  readonly tone: "success" | "danger";
  readonly label: string;
}

async function write(
  storage: PlatformStorage<AppDefinition>,
  value: ReadonlyArray<string>,
): Promise<Outcome> {
  try {
    await storage.set("recentSearches", [...value]);

    return { tone: "success", label: "written" };
  } catch (error) {
    return {
      tone: "danger",
      label: isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
    };
  }
}

/* The area also refuses more than 120 writes a minute. Going past it deliberately is the second way a browser says no, and unlike the size limit it keeps saying no for the rest of the minute. */
async function hammer(): Promise<Outcome> {
  for (let index = 0; index < 140; index += 1) {
    /*
      oxlint-disable-next-line no-await-in-loop -- Sequential is the demonstration rather than an oversight: the refusal has to be attributed to the write that provoked it, and `Promise.all` would report only that one of a hundred and forty failed.
    */
    const outcome = await write(sync, [`burst ${index}`]);

    if (outcome.tone === "danger") return { ...outcome, label: `${outcome.label} at ${index}` };
  }

  return { tone: "success", label: "140 writes accepted" };
}

export function QuotaPanel() {
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});

  const record = (name: string, run: () => Promise<Outcome>): void => {
    void run().then((outcome) => setOutcomes((current) => ({ ...current, [name]: outcome })));
  };

  const show = (name: string) => {
    const outcome = outcomes[name];

    return outcome === undefined ? (
      <span className="text-xs text-faint">not run</span>
    ) : (
      <Badge tone={outcome.tone}>{outcome.label}</Badge>
    );
  };

  return (
    <Card
      title="Writes the browser refuses"
      lead="Write the same long list to sync and to local. Only sync refuses it."
      how={
        <>
          <p>
            The library does not police quotas or pretend to know them. A call the area rejects is
            let through in the browser&rsquo;s own words, wrapped as{" "}
            <Code>StorageAdapterError</Code> with the rejection kept as its cause, and reported to
            the Error log. A refused write leaves the area exactly as it was.
          </p>
          <p>
            Values are stored bare rather than as text. Encoding them for an area that transports
            JSON natively would spend this quota twice and stop anything else reading what was
            written, which is why <Code>passthroughSerializer</Code> is what this adapter carries.
          </p>
        </>
      }
    >
      <div className="divide-y divide-line">
        <Field label="A modest list, to sync" hint="Three terms, well inside every limit.">
          <Button onClick={() => record("modest", () => write(sync, MODEST))}>Write</Button>
          {show("modest")}
        </Field>

        <Field
          label="An oversized list, to sync"
          hint="Four hundred terms, past sync's eight kilobytes an item."
        >
          <Button tone="danger" onClick={() => record("over-sync", () => write(sync, OVERSIZED))}>
            Write
          </Button>
          {show("over-sync")}
        </Field>

        <Field
          label="The same oversized list, to local"
          hint="The same value. local allows about ten megabytes."
        >
          <Button onClick={() => record("over-local", () => write(local, OVERSIZED))}>Write</Button>
          {show("over-local")}
        </Field>

        <Field
          label="Past the write rate, on sync"
          hint={
            <>
              <Badge tone="warning">run it last</Badge> 140 writes against a limit of 120 a minute;
              sync then refuses every write until the minute is up.
            </>
          }
        >
          <Button tone="danger" onClick={() => record("hammer", hammer)}>
            Hammer it
          </Button>
          {show("hammer")}
        </Field>
      </div>
    </Card>
  );
}
