"use client";

import { Button, Card, Code, Field, TextField, Value } from "@examples/ui";
import type { SyncPlatformStorage } from "@platform-storage/web";
import { isSyncStorageAdapter } from "@platform-storage/web";
import type { ScratchDefinition } from "@examples/schema";
import { notifyStorageChanged, useHydrated, useStorageValue } from "@platform-storage/react";

import { adopting, teamA, teamB } from "../store/storage";

/* Read after the hooks, whose reads are what move a value, and only once hydrated: a server has nothing stored to show. A backend that is not there must not take the render with it. */
function holds(storage: SyncPlatformStorage<ScratchDefinition>, name: string): boolean {
  const { adapter } = storage;

  if (!isSyncStorageAdapter(adapter)) return false;

  try {
    return adapter.getSync(name) !== undefined;
  } catch {
    return false;
  }
}

/* Through the adapter rather than `window`, so a backend that is not there plants nothing rather than throwing. */
function plantBare(name: string): void {
  const { adapter } = adopting;

  if (!isSyncStorageAdapter(adapter)) return;

  try {
    adapter.setSync(name, JSON.stringify("from before the prefix"));
  } catch {
    return;
  }

  notifyStorageChanged(adopting, "note");
}

interface TeamRowProps {
  readonly label: string;
  readonly storage: SyncPlatformStorage<ScratchDefinition>;
}

function TeamRow({ label, storage }: TeamRowProps) {
  const [note, writer] = useStorageValue(storage, "note");

  return (
    <Field
      label={label}
      hint={
        <>
          Stored as <Code>{storage.physicalKey("note")}</Code> · reads as{" "}
          <output aria-label={`${label} reads as`}>
            <Value value={note} />
          </output>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <TextField
          label={`${label} note`}
          value={note ?? ""}
          placeholder="unset"
          onChange={(next) => {
            if (next === "") writer.remove();
            else writer.set(next);
          }}
        />
        <Button
          onClick={() => {
            storage.clearSync();
            notifyStorageChanged(storage);
          }}
        >
          Clear
        </Button>
      </div>
    </Field>
  );
}

export function PrefixPanel() {
  const [adopted] = useStorageValue(adopting, "note");
  const hydrated = useHydrated();
  const bareName = "note";

  return (
    <Card
      title="Several storages on one origin"
      description="Two storages over the same schema and the same localStorage, each under its own prefix. Neither sees, overwrites or clears the other's note."
    >
      <div className="divide-y divide-line">
        <TeamRow label="Team A" storage={teamA} />
        <TeamRow label="Team B" storage={teamB} />

        <Field
          label="Adopting a prefix"
          hint={
            <>
              Stored as <Code>{adopting.physicalKey("note")}</Code> with <Code>readUnprefixed</Code>
              , so a note left under the bare name <Code>{bareName}</Code> moves in when it is read.
              Reads as{" "}
              <output aria-label="Adopted note reads as">
                <Value value={adopted} />
              </output>
              {" · "}bare name{" "}
              <output aria-label="Bare note">
                {hydrated ? (holds(adopting, bareName) ? "still there" : "empty") : "…"}
              </output>
            </>
          }
        >
          <Button
            onClick={() => {
              plantBare(bareName);
            }}
          >
            Plant a bare note
          </Button>
        </Field>
      </div>
    </Card>
  );
}
