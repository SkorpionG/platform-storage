"use client";

import { KEY_NOTES } from "@examples/schema";
import { Badge, Button, Card, Code, Outcome, Prose, Value } from "@examples/ui";
import { notifyStorageChanged, useHydrated, useStorageValue } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";
import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";

import { getOriginServerSnapshot, getOriginSnapshot, subscribeToOrigin } from "../store/origin";
import { local } from "../store/storage";

type ShapeKey = "layout" | "accent";

interface Sample {
  readonly key: ShapeKey;
  readonly label: string;
  readonly text: string;
  /** What a read does with this, in one sentence. */
  readonly explains: string;
}

const SAMPLES: ReadonlyArray<Sample> = [
  {
    key: "layout",
    label: "From before the key had versions",
    text: '{"compact":true}',
    explains:
      "No envelope, so it counts as version 1. The read moves it to version 2 and saves it.",
  },
  {
    key: "layout",
    label: "From a newer release",
    text: '{"v":9,"d":{"density":"tight"}}',
    explains:
      "Version 9 is newer than this code. The read falls back, reports it, and leaves it alone.",
  },
  {
    key: "accent",
    label: "Text that was never JSON",
    text: "GREEN",
    explains: "It cannot be parsed, so `recover` gets the raw text, lowercases it and saves it.",
  },
];

/** Writes past the library, the way an older release of an app would have left it. */
function plant({ key, text }: Sample): void {
  window.localStorage.setItem(local.physicalKey(key), text);
  notifyStorageChanged(local, key);
}

/** What the origin holds under the key, or `undefined` for nothing. Read during a render, where a backend that is not there must not take the page with it. */
function storedText(key: ShapeKey): string | undefined {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return undefined;

  try {
    const raw = adapter.getSync(local.physicalKey(key));
    return raw === undefined ? undefined : String(raw);
  } catch {
    return undefined;
  }
}

interface KeyGroupProps {
  readonly storageKey: ShapeKey;
  readonly label: string;
  /** What the key declares, which is what decides what a read does with old data. */
  readonly declares: ReactNode;
  readonly value: unknown;
  readonly stored: string | undefined;
  readonly hydrated: boolean;
  readonly planted: string | undefined;
  readonly onPlant: (sample: Sample) => void;
  readonly onClear: () => void;
}

function KeyGroup({
  storageKey,
  label,
  declares,
  value,
  stored,
  hydrated,
  planted,
  onPlant,
  onClear,
}: KeyGroupProps) {
  return (
    <div className="rounded-lg border border-line px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Code>{storageKey}</Code>
        <span className="text-xs text-soft">{declares}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Outcome label="Now reads as">
          <output aria-label={`${label} reads as`}>
            <Value value={value} />
          </output>
        </Outcome>
        <Outcome label="Stored as">
          <output aria-label={`${label} stored as`}>
            <Code>{hydrated ? (stored ?? "nothing") : "…"}</Code>
          </output>
        </Outcome>
        <Button onClick={onClear}>Clear</Button>
      </div>

      <div className="mt-3 space-y-2">
        {SAMPLES.filter((sample) => sample.key === storageKey).map((sample) => (
          <div key={sample.label} className="rounded-lg border border-line bg-inset px-3 py-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-body">{sample.label}</div>
                <p className="mt-0.5 text-xs text-soft">
                  <Prose text={sample.explains} />
                </p>
              </div>
              <Button onClick={() => onPlant(sample)}>Plant it</Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
              <Outcome label="Plants">
                <Code>{sample.text}</Code>
              </Outcome>
              {planted === sample.label && hydrated ? (
                <Outcome label="Then">
                  {stored === sample.text ? (
                    <Badge tone="warning">left as it was</Badge>
                  ) : (
                    <Badge tone="success">read and saved over it</Badge>
                  )}
                </Outcome>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MigrationPanel() {
  const [layout, layoutWriter] = useStorageValue(local, "layout");
  const [accent, accentWriter] = useStorageValue(local, "accent");
  const [planted, setPlanted] = useState<Partial<Record<ShapeKey, string | undefined>>>({});

  /* Read after the hooks above, whose reads are what save a repair, and only in the browser, because a server has no stored text to print. */
  const hydrated = useHydrated();

  /*
    Followed only to render again on every change to the origin. The stored text is read during the render below rather than taken from this snapshot, which a repair does not move, but a clear elsewhere on the page can leave both values reading the same and so would never render this card otherwise.
  */
  useSyncExternalStore(subscribeToOrigin, getOriginSnapshot, getOriginServerSnapshot);

  const plantSample = (sample: Sample): void => {
    plant(sample);
    setPlanted((current) => ({ ...current, [sample.key]: sample.label }));
  };

  const forget = (key: ShapeKey): void => {
    setPlanted((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <Card
      title="Data that changes shape"
      lead="Plant what another release of this app would have stored. The key is read at once; compare what was planted with what is stored after."
      how={
        <>
          <p>
            <Prose text={KEY_NOTES.layout.note} />
          </p>
          <p>
            <Prose text={KEY_NOTES.accent.note} />
          </p>
          <p>
            Planting tells the page the key changed, so every hook reading it reads it again. That
            read is what migrates or repairs the value and saves it, which is why the stored text
            changes without anything being written by hand.
          </p>
        </>
      }
    >
      <div className="space-y-3">
        <KeyGroup
          storageKey="layout"
          label="Layout"
          declares={
            <>
              versioned: <Code>{"{ compact: boolean }"}</Code> then{" "}
              <Code>{'{ density: "compact" | "comfortable" }'}</Code>
            </>
          }
          value={layout}
          stored={hydrated ? storedText("layout") : undefined}
          hydrated={hydrated}
          planted={planted.layout}
          onPlant={plantSample}
          onClear={() => {
            layoutWriter.remove();
            forget("layout");
          }}
        />

        <KeyGroup
          storageKey="accent"
          label="Accent"
          declares={
            <>
              <Code>{'"blue" | "green"'}</Code>, with a <Code>recover</Code> that lowercases what it
              is given
            </>
          }
          value={accent}
          stored={hydrated ? storedText("accent") : undefined}
          hydrated={hydrated}
          planted={planted.accent}
          onPlant={plantSample}
          onClear={() => {
            accentWriter.remove();
            forget("accent");
          }}
        />
      </div>
    </Card>
  );
}
