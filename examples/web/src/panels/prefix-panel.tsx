"use client";

import { Badge, Button, Card, Code, Field, TextField, Value } from "@examples/ui";
import type { SyncPlatformStorage } from "@platform-storage/web";
import { isSyncStorageAdapter } from "@platform-storage/web";
import type { ScratchDefinition } from "@examples/schema";
import { notifyStorageChanged, useHydrated, useStorageValue } from "@platform-storage/react";
import { useState } from "react";

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
  /* Counts plants, so the card renders after each one even when the adopted value reads the same, which is exactly the case it has to explain. */
  const [plants, setPlants] = useState(0);

  /* Read after the hook above, whose read is what moves the bare note in. */
  const bareHeld = hydrated && holds(adopting, bareName);

  return (
    <Card
      title="Prefixes"
      lead="Type a note for each team, then clear one: the other keeps its note. Then plant a bare note and watch it move under the prefix."
      how={
        <>
          <p>
            Two storages over the same schema and the same <Code>localStorage</Code>, each under its
            own prefix. Neither sees, overwrites or clears the other&rsquo;s note.
          </p>
          <p>
            The third is built with <Code>readUnprefixed</Code>, which is how an app adopts a prefix
            after shipping without one: a value still under the bare name moves in under the prefix
            the first time it is read. Only while the prefixed name is empty, though: once{" "}
            <Code>app:note</Code> holds a value, a bare one planted later is left alone rather than
            allowed to overwrite it. Clear both, and the next plant moves in again.
          </p>
        </>
      }
    >
      <div className="divide-y divide-line">
        <TeamRow label="Team A" storage={teamA} />
        <TeamRow label="Team B" storage={teamB} />

        <Field
          label="Adopting a prefix"
          hint={
            <>
              Stored as <Code>{adopting.physicalKey("note")}</Code> · reads as{" "}
              <output aria-label="Adopted note reads as">
                <Value value={adopted} />
              </output>
              {" · "}bare <Code>{bareName}</Code>{" "}
              <output aria-label="Bare note">
                {hydrated ? (bareHeld ? "still there" : "empty") : "…"}
              </output>
              {plants === 0 || !hydrated ? null : (
                <span className="ml-2">
                  <output aria-label="Bare note outcome">
                    {bareHeld ? (
                      <Badge tone="warning">
                        left alone: {adopting.physicalKey("note")} already holds a value
                      </Badge>
                    ) : (
                      <Badge tone="success">moved into {adopting.physicalKey("note")} ✓</Badge>
                    )}
                  </output>
                </span>
              )}
            </>
          }
        >
          <Button
            onClick={() => {
              plantBare(bareName);
              setPlants((count) => count + 1);
            }}
          >
            Plant a bare note
          </Button>
          <Button
            onClick={() => {
              adopting.clearSync();
              notifyStorageChanged(adopting);
              setPlants(0);
            }}
            title="clearSync() removes both names, because the storage still reads the bare one"
          >
            Clear both
          </Button>
        </Field>
      </div>
    </Card>
  );
}
