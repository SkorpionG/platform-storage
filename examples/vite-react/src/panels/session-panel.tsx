import { Button, Card, Field, TextField, Value } from "@examples/ui";

import { local, session } from "../storage";
import { useStoredValue, useWrite } from "../use-storage";

export function SessionPanel() {
  const write = useWrite();
  const inLocal = useStoredValue(local, "displayName");
  const inSession = useStoredValue(session, "displayName");

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
            onChange={(next) =>
              write(() => {
                if (next === "") local.removeSync("displayName");
                else local.setSync("displayName", next);
              })
            }
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
            onChange={(next) =>
              write(() => {
                if (next === "") session.removeSync("displayName");
                else session.setSync("displayName", next);
              })
            }
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
