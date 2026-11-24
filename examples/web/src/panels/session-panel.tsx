"use client";

import { Button, Card, Code, Field, TextField, Value } from "@examples/ui";

import { useStorageValue } from "@platform-storage/react";

import { local, session } from "../store/storage";

export function SessionPanel() {
  const [inLocal] = useStorageValue(local, "displayName");
  const [inSession, inSessionWriter] = useStorageValue(session, "displayName");

  return (
    <Card
      title="localStorage and sessionStorage"
      lead="Type a name for this tab's session, then reload. Close the tab and it is gone."
      how={
        <>
          <p>
            Two storages over the same definition and the same physical key, each in its own
            backend. Neither can see the other&rsquo;s values: the local display name is set on the
            Values tab, and this field never changes it.
          </p>
          <p>
            Both survive a reload. Only <Code>sessionStorage</Code> is emptied when the tab closes.
          </p>
        </>
      }
    >
      <div className="divide-y divide-line">
        <Field
          label="sessionStorage"
          hint={
            <>
              Emptied when the tab closes · reads as <Value value={inSession} />
            </>
          }
        >
          <TextField
            label="Display name in sessionStorage"
            value={inSession ?? ""}
            placeholder="unset"
            onChange={(next) => {
              if (next === "") inSessionWriter.remove();
              else inSessionWriter.set(next);
            }}
          />
        </Field>

        <Field
          label="localStorage"
          hint="Survives a reload and a browser restart · set on the Values tab"
        >
          <Value value={inLocal} />
        </Field>
      </div>

      <div className="mt-3">
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    </Card>
  );
}
