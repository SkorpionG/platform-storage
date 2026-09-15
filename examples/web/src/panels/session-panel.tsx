"use client";

import { Button, Card, Field, TextField, Value } from "@examples/ui";

import { useStorageValue } from "@platform-storage/react";

import { local, session } from "../store/storage";

export function SessionPanel() {
  const [inLocal, inLocalWriter] = useStorageValue(local, "displayName");
  const [inSession, inSessionWriter] = useStorageValue(session, "displayName");

  return (
    <Card
      title="One schema, two backends"
      description="localStorage and sessionStorage are separate storages over the same definition. Neither can see the other's values, and each keeps its own copy under the same physical key."
    >
      <div className="divide-y divide-line">
        <Field
          label="localStorage"
          hint={
            <>
              Survives a reload and a browser restart. Currently <Value value={inLocal} />
            </>
          }
        >
          <TextField
            label="Display name in localStorage"
            value={inLocal ?? ""}
            placeholder="unset"
            onChange={(next) => {
              if (next === "") inLocalWriter.remove();
              else inLocalWriter.set(next);
            }}
          />
        </Field>

        <Field
          label="sessionStorage"
          hint={
            <>
              Emptied when the tab closes. Currently <Value value={inSession} />
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
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
        <span className="text-xs text-soft">
          Both survive a reload; only the session one is lost when the tab closes.
        </span>
      </div>
    </Card>
  );
}
