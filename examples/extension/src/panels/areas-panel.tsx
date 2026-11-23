import { Button, Card, Code, Field, TextField } from "@examples/ui";
import { useAsyncStorageValue } from "@platform-storage/react";
import { hasFallback } from "@platform-storage/webextension";
import type { PlatformStorage } from "@platform-storage/webextension";
import type { AppDefinition } from "@examples/schema";

import { AsyncValue, NotReady } from "../async-value";
import { local, session, sessionOrMemory, sync } from "../store/storages";

interface AreaRowProps {
  readonly storage: PlatformStorage<AppDefinition>;
  readonly label: string;
  readonly note: string;
}

function AreaRow({ storage, label, note }: AreaRowProps) {
  const [name, writer] = useAsyncStorageValue(storage, "displayName");
  /* `undefined` until the hook's first read decides it and renders the row again, since asking never forces the choice. */
  const chosen = hasFallback(storage.adapter) ? storage.adapter.chosen() : undefined;

  return (
    <Field
      label={label}
      hint={
        <>
          <AsyncValue stored={name} />
          {chosen === undefined ? null : (
            <span className="ml-1.5 text-faint">
              · chose <output aria-label={`${label} chose`}>{chosen}</output>
            </span>
          )}
          <p className="mt-1 text-soft">{note}</p>
        </>
      }
    >
      {name.status === "ready" ? (
        <>
          <TextField
            label={`${label} display name`}
            value={name.value ?? ""}
            placeholder="unset"
            width="w-36"
            onChange={(next) => {
              if (next === "") void writer.remove();
              else void writer.set(next);
            }}
          />
          <Button onClick={() => void writer.remove()}>Remove</Button>
        </>
      ) : (
        <NotReady stored={name} />
      )}
    </Field>
  );
}

export function AreasPanel() {
  return (
    <Card
      title="One schema, three areas that cannot see each other"
      description="The same definition, handed to three storages. Writing a display name into one leaves the other two exactly as they were, because a storage addresses one area and nothing else."
    >
      <div className="divide-y divide-line">
        <AreaRow
          storage={local}
          label="storage.local"
          note="Roughly ten megabytes, kept on this machine, and the default when no area is named."
        />
        <AreaRow
          storage={sync}
          label="storage.sync"
          note="Replicated to the user's other signed-in browsers, and far smaller: eight kilobytes per item."
        />
        <AreaRow
          storage={session}
          label="storage.session"
          note="Held in memory and emptied when the browser closes. Absent on Manifest V2 and before Chrome 102 or Firefox 115."
        />
        <AreaRow
          storage={sessionOrMemory}
          label="storage.session, or memory"
          note='The same area built with fallback: "memory". Where the area is there it chooses it; where it is not, it answers from memory instead of reporting itself unavailable.'
        />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        The Firefox build of this extension is Manifest V2, where <Code>storage.session</Code> does
        not exist. The row above does not crash there: addressing a missing area is reported as{" "}
        <Code>StorageUnavailableError</Code>, the same way a missing extension API is, and the read
        comes back as a failure the row can render. The row below it is the same area with a
        fallback, which on Firefox chooses memory and answers instead.
      </p>
    </Card>
  );
}
