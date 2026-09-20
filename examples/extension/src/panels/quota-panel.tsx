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
      title="What happens when the browser says no"
      description="The library does not police quotas and does not pretend to know them. A call the area rejects is let through in the browser's own vocabulary, and the engine wraps it as StorageAdapterError keeping that rejection as its cause."
    >
      <div className="divide-y divide-line">
        <Field
          label="A modest list, to sync"
          hint="Three terms. Well inside every limit the area has."
        >
          <Button onClick={() => record("modest", () => write(sync, MODEST))}>Write</Button>
          {show("modest")}
        </Field>

        <Field
          label="An oversized list, to sync"
          hint="Four hundred terms, past the eight kilobytes an item may occupy in the sync area."
        >
          <Button tone="danger" onClick={() => record("over-sync", () => write(sync, OVERSIZED))}>
            Write
          </Button>
          {show("over-sync")}
        </Field>

        <Field
          label="The same oversized list, to local"
          hint="Identical value, different area. The local quota is roughly ten megabytes, so this one is accepted."
        >
          <Button onClick={() => record("over-local", () => write(local, OVERSIZED))}>Write</Button>
          {show("over-local")}
        </Field>

        <Field
          label="Past the write rate, on sync"
          hint="A hundred and forty writes in a row, against a limit of a hundred and twenty a minute. This one leaves sync refusing writes until the minute is up, so run it last."
        >
          <Button tone="danger" onClick={() => record("hammer", hammer)}>
            Hammer it
          </Button>
          {show("hammer")}
        </Field>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Every refusal here is also in the event log, with the browser&rsquo;s own message on it. The
        value that failed is the one thing the library will not guess about: a rejected write leaves
        the area exactly as it was, and what to do next is the application&rsquo;s to decide.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        Values are stored bare, as the values themselves rather than as text. Encoding them for an
        area that transports JSON natively would spend this quota twice over, and would stop
        anything else reading what was written — which is exactly why{" "}
        <Code>passthroughSerializer</Code> is what this adapter carries.
      </p>
    </Card>
  );
}
