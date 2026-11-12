"use client";

import { Button, Card, Code, Field } from "@examples/ui";
import { notifyStorageChanged } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";

import { adopting, local, localRecovering, TEAM_A_PREFIX, teamA, teamB } from "../store/storage";

const FOREIGN_KEY = "analytics:session";
const LEFTOVER = `${TEAM_A_PREFIX}draft`;

/* Every storage over this origin, since a clear of the whole origin is announced only by the storage that made it. */
function notifyEveryStorage(): void {
  notifyStorageChanged(local);
  notifyStorageChanged(localRecovering);
  notifyStorageChanged(teamA);
  notifyStorageChanged(teamB);
  notifyStorageChanged(adopting);
}

/* Through the adapter rather than `window`, so a backend that is not there plants nothing rather than throwing. */
function plant(name: string, value: string): void {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return;

  try {
    adapter.setSync(name, JSON.stringify(value));
  } catch {
    return;
  }

  notifyStorageChanged(local);
}

export function ClearPanel() {
  return (
    <Card
      title="clear() removes only what you name"
      description="An origin is shared. Another script, another library, or another storage over a different schema may be keeping things beside yours, so wiping the origin has to be asked for by name."
    >
      <div className="divide-y divide-line">
        <Field
          label="Only what the schema declares"
          hint={
            <>
              Plant <Code>{FOREIGN_KEY}</Code>, fill some values above, then clear. Every schema key
              disappears from the inspector and the foreign key stays exactly where it was.{" "}
              <Code>localStorage</Code> has no batch call, so the library removes each declared name
              in turn rather than calling <Code>localStorage.clear()</Code>.
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                plant(FOREIGN_KEY, "belongs to someone else");
              }}
            >
              Plant a foreign key
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                local.clearSync();
              }}
            >
              clearSync()
            </Button>
          </div>
        </Field>

        <Field
          label="What a schema no longer declares"
          hint={
            <>
              <Code>{LEFTOVER}</Code> is what a key deleted from Team A's schema leaves behind.{" "}
              <Code>"undeclared"</Code> lists the origin and removes only names under Team A's
              prefix that its schema does not list, so Team B's note and the foreign key stay. No
              declared key changes, so nothing is announced and the panel tells the inspector
              itself.
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                plant(LEFTOVER, "from a deleted key");
              }}
            >
              Plant a leftover
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                teamA.clearSync("undeclared");
                notifyStorageChanged(teamA);
              }}
            >
              clearSync("undeclared")
            </Button>
          </div>
        </Field>

        <Field
          label="The whole origin"
          hint={
            <>
              <Code>"everything"</Code> removes every name on the origin, other code's included, and
              cannot be combined with another target. It is announced by the storage that ran it, so
              every other storage on the page is told as well.
            </>
          }
        >
          <Button
            tone="danger"
            onClick={() => {
              local.clearSync("everything");

              notifyEveryStorage();
            }}
          >
            clearSync("everything")
          </Button>
        </Field>
      </div>
    </Card>
  );
}
