"use client";

import { KEY_NOTES } from "@examples/schema";
import type { AppKey } from "@examples/schema";
import { Button, Card, Code, Field, Value } from "@examples/ui";
import { notifyStorageChanged, useHydrated, useStorageValue } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";

import { local } from "../store/storage";

interface Sample {
  readonly key: AppKey;
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
    explains: "No envelope, so it counts as version 1. The chain brings it forward and saves it.",
  },
  {
    key: "layout",
    label: "From a newer release",
    text: '{"v":9,"d":{"density":"tight"}}',
    explains: "Newer than this code. A read falls back, reports it, and leaves the data alone.",
  },
  {
    key: "accent",
    label: "Text that was never JSON",
    text: "GREEN",
    explains: "It cannot be parsed, so `recover` receives the text, repairs it and saves it bare.",
  },
];

/** Writes past the library, the way an older release of an app would have left it. */
function plant({ key, text }: Sample): void {
  window.localStorage.setItem(local.physicalKey(key), text);
  notifyStorageChanged(local, key);
}

function storedText(key: AppKey): string {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return "";

  /* Read during a render, where a backend that is not there must not take the page with it. */
  try {
    return String(adapter.getSync(local.physicalKey(key)) ?? "nothing");
  } catch {
    return "unavailable";
  }
}

export function MigrationPanel() {
  const [layout, layoutWriter] = useStorageValue(local, "layout");
  const [accent, accentWriter] = useStorageValue(local, "accent");

  /* Read after the hooks above, whose reads are what save a repair, and only in the browser, because a server has no stored text to print. */
  const hydrated = useHydrated();

  return (
    <Card
      title="Stored data that changes shape"
      description="These buttons plant what an older or newer release would have left behind. The key is read as soon as it changes, so the value and the stored text below show what that read did."
    >
      <div className="divide-y divide-line">
        <Field
          label="Layout"
          hint={
            <>
              Reads as{" "}
              <output aria-label="Layout reads as">
                <Value value={layout} />
              </output>
              <p className="mt-1 text-soft">
                Stored as{" "}
                <output aria-label="Layout stored as">
                  <Code>{hydrated ? storedText("layout") : "…"}</Code>
                </output>
              </p>
              <p className="mt-1 text-soft">{KEY_NOTES.layout.note}</p>
            </>
          }
        >
          <Button
            onClick={() => {
              layoutWriter.remove();
            }}
          >
            Clear
          </Button>
        </Field>

        <Field
          label="Accent"
          hint={
            <>
              Reads as{" "}
              <output aria-label="Accent reads as">
                <Value value={accent} />
              </output>
              <p className="mt-1 text-soft">
                Stored as{" "}
                <output aria-label="Accent stored as">
                  <Code>{hydrated ? storedText("accent") : "…"}</Code>
                </output>
              </p>
              <p className="mt-1 text-soft">{KEY_NOTES.accent.note}</p>
            </>
          }
        >
          <Button
            onClick={() => {
              accentWriter.remove();
            }}
          >
            Clear
          </Button>
        </Field>
      </div>

      <div className="mt-3 space-y-2">
        {SAMPLES.map((sample) => (
          <div
            key={sample.label}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-inset px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Code>{sample.key}</Code>
                <span className="text-xs font-medium text-body">{sample.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-soft">{sample.explains}</p>
            </div>

            <Button
              onClick={() => {
                plant(sample);
              }}
            >
              Plant it
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
