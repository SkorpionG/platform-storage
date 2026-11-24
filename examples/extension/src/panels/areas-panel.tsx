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
          <span className="ml-1.5 text-soft">· {note}</span>
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
      title="Three areas"
      lead="Type a display name into one area. The others keep their own."
      how={
        <>
          <p>
            The same definition, handed to one storage per area. A storage addresses one area and
            nothing else, so a write to one leaves the others exactly as they were.
          </p>
          <p>
            The Firefox build is Manifest V2, where <Code>storage.session</Code> does not exist.
            Addressing it is reported as <Code>StorageUnavailableError</Code>, the same way a
            missing extension API is, and the row renders the failure. The last row is the same area
            built with <Code>fallback: &quot;memory&quot;</Code>, which chooses memory there and
            answers instead.
          </p>
        </>
      }
    >
      <div className="divide-y divide-line">
        <AreaRow
          storage={local}
          label="storage.local"
          note="About ten megabytes, on this machine. The default."
        />
        <AreaRow
          storage={sync}
          label="storage.sync"
          note="Copied to the user's other browsers. Eight kilobytes an item."
        />
        <AreaRow
          storage={session}
          label="storage.session"
          note="Emptied when the browser closes. Absent on Manifest V2."
        />
        <AreaRow
          storage={sessionOrMemory}
          label="storage.session, or memory"
          note="The same area, answering from memory where it is absent."
        />
      </div>
    </Card>
  );
}
