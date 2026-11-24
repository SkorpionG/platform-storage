import { KEY_NOTES } from "@examples/schema";
import { Badge, Button, Card, Code, formatValue, Outcome, Prose } from "@examples/ui";
import { useAsyncStorageValue } from "@platform-storage/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { browser } from "wxt/browser";

import { AsyncValue } from "../async-value";
import type { AsyncValueProps } from "../async-value";
import { useAreaContents } from "../hooks/use-area-contents";
import { local } from "../store/storages";

type ShapeKey = "layout" | "accent";

interface Sample {
  readonly key: ShapeKey;
  readonly label: string;
  /** What another release left in the area: a value, since an area stores values rather than text. */
  readonly value: unknown;
  /** What a read does with this, in one sentence. */
  readonly explains: string;
}

const SAMPLES: ReadonlyArray<Sample> = [
  {
    key: "layout",
    label: "From before the key had versions",
    value: { compact: true },
    explains:
      "No envelope, so it counts as version 1. The read moves it to version 2 and saves it.",
  },
  {
    key: "layout",
    label: "From a newer release",
    value: { v: 9, d: { density: "tight" } },
    explains:
      "Version 9 is newer than this code. The read falls back, reports it, and leaves it alone.",
  },
  {
    key: "accent",
    label: "A value the enum rejects",
    value: "GREEN",
    explains: "The schema refuses it, so `recover` gets the raw value, lowercases it and saves it.",
  },
];

/** Writes past the library, the way an older release of the extension would have left it. The browser reports the change, and the hooks read the key again. */
async function plant({ key, value }: Sample): Promise<void> {
  await browser.storage.local.set({ [local.physicalKey(key)]: value });
}

interface KeyGroupProps {
  readonly storageKey: ShapeKey;
  readonly label: string;
  /** What the key declares, which is what decides what a read does with old data. */
  readonly declares: ReactNode;
  readonly stored: AsyncValueProps["stored"];
  /** What the area holds, formatted, or `undefined` for nothing. */
  readonly held: string | undefined;
  readonly planted: string | undefined;
  readonly onPlant: (sample: Sample) => void;
  readonly onClear: () => void;
}

function KeyGroup({
  storageKey,
  label,
  declares,
  stored,
  held,
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
            <AsyncValue stored={stored} />
          </output>
        </Outcome>
        <Outcome label="Stored as">
          <output aria-label={`${label} stored as`}>
            <Code>{held ?? "nothing"}</Code>
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
                <Code>{formatValue(sample.value)}</Code>
              </Outcome>
              {planted === sample.label ? (
                <Outcome label="Then">
                  {held === formatValue(sample.value) ? (
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
  const [layout, layoutWriter] = useAsyncStorageValue(local, "layout");
  const [accent, accentWriter] = useAsyncStorageValue(local, "accent");
  const [planted, setPlanted] = useState<Partial<Record<ShapeKey, string | undefined>>>({});

  /* The area itself, re-read on every change it reports, which includes the save a migration or a repair makes. */
  const { entries } = useAreaContents("local");
  const held = (key: ShapeKey): string | undefined => {
    const entry = entries.find((candidate) => candidate.key === local.physicalKey(key));
    return entry === undefined ? undefined : formatValue(entry.value);
  };

  const plantSample = (sample: Sample): void => {
    setPlanted((current) => ({ ...current, [sample.key]: sample.label }));
    void plant(sample);
  };

  return (
    <Card
      title="Data that changes shape"
      lead="Plant what another release of this extension would have stored. The key is read at once; compare what was planted with what is stored after."
      how={
        <>
          <p>
            <Prose text={KEY_NOTES.layout.note} />
          </p>
          <p>
            <Prose text={KEY_NOTES.accent.note} />
          </p>
          <p>
            The browser reports the plant, so every hook reading the key reads it again. That read
            is what migrates or repairs the value and saves it, which is why the stored value
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
          stored={layout}
          held={held("layout")}
          planted={planted.layout}
          onPlant={plantSample}
          onClear={() => {
            setPlanted((current) => ({ ...current, layout: undefined }));
            void layoutWriter.remove();
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
          stored={accent}
          held={held("accent")}
          planted={planted.accent}
          onPlant={plantSample}
          onClear={() => {
            setPlanted((current) => ({ ...current, accent: undefined }));
            void accentWriter.remove();
          }}
        />
      </div>
    </Card>
  );
}
