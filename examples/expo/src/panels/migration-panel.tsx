import { KEY_NOTES } from "@examples/schema";
import { Button } from "@expo/ui";
import {
  notifyStorageChanged,
  subscribeToStorage,
  useAsyncStorageValue,
} from "@platform-storage/react";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { AsyncValue } from "../components/async-value";
import type { AsyncValueProps } from "../components/async-value";
import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Outcome } from "../components/outcome";
import { Pending } from "../components/pending";
import { Explain, Prose } from "../components/prose";
import { usePalette } from "../hooks/use-palette";
import { plantText, readText } from "../store/raw";
import { local } from "../store/storages";
import { MONO, RADIUS } from "../theme";

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

/* What the device holds, read after the key itself, since that read is what saves a migration or a repair and it announces nothing. */
async function heldOnDevice(key: ShapeKey): Promise<string | undefined> {
  await local.get(key);
  return readText(local.physicalKey(key));
}

/** What each key declares, which is what decides what a read does with old data. */
const DECLARES: { readonly [Key in ShapeKey]: string } = {
  layout: 'Versioned: `{ compact: boolean }`, then `{ density: "compact" | "comfortable" }`',
  accent: '`"blue" | "green"`, with a `recover` that lowercases what it is given',
};

interface KeyGroupProps {
  readonly storageKey: ShapeKey;
  readonly stored: AsyncValueProps["stored"];
  /** What the device holds, or `undefined` for nothing; `null` until it has been read. */
  readonly held: string | undefined | null;
  readonly planted: string | undefined;
  readonly onPlant: (sample: Sample) => void;
  readonly onClear: () => void;
  /** Whether this group opens the card, so its row draws no rule under the header's. */
  readonly first?: boolean;
}

function KeyGroup({
  storageKey,
  stored,
  held,
  planted,
  onPlant,
  onClear,
  first = false,
}: KeyGroupProps) {
  const palette = usePalette();
  const mono = { color: palette.body, fontFamily: MONO, fontSize: 11 } as const;

  return (
    <>
      <Field
        first={first}
        label={KEY_NOTES[storageKey].label}
        hint={
          <View style={{ gap: 4 }}>
            <Prose
              text={DECLARES[storageKey]}
              style={{ color: palette.soft, fontSize: 12, lineHeight: 17 }}
            />
            <Outcome label="Now reads as">
              <AsyncValue stored={stored} />
            </Outcome>
            <Outcome label="Stored as">
              {held === null ? (
                <Pending>reading…</Pending>
              ) : (
                <Text style={mono}>{held ?? "nothing"}</Text>
              )}
            </Outcome>
          </View>
        }
      >
        <Control>
          <Button variant="outlined" label="Clear" onPress={onClear} />
        </Control>
      </Field>

      {SAMPLES.filter((sample) => sample.key === storageKey).map((sample) => (
        <View
          key={sample.label}
          style={{
            backgroundColor: palette.inset,
            borderRadius: RADIUS.inset,
            gap: 4,
            marginBottom: 8,
            padding: 10,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <Text style={{ color: palette.fg, flex: 1, fontSize: 13, fontWeight: "500" }}>
              {sample.label}
            </Text>
            <Control>
              <Button variant="outlined" label="Plant it" onPress={() => onPlant(sample)} />
            </Control>
          </View>
          <Prose
            text={sample.explains}
            style={{ color: palette.soft, fontSize: 12, lineHeight: 17 }}
          />
          <Outcome label="Plants">
            <Text style={mono}>{sample.text}</Text>
          </Outcome>
          {planted === sample.label && held !== null ? (
            <Outcome label="Then">
              {held === sample.text ? (
                <Badge tone="warning">left as it was</Badge>
              ) : (
                <Badge tone="success">read and saved over it</Badge>
              )}
            </Outcome>
          ) : null}
        </View>
      ))}
    </>
  );
}

export function MigrationPanel() {
  const [layout, layoutWriter] = useAsyncStorageValue(local, "layout");
  const [accent, accentWriter] = useAsyncStorageValue(local, "accent");
  const [planted, setPlanted] = useState<Partial<Record<ShapeKey, string | undefined>>>({});
  const [held, setHeld] = useState<Record<ShapeKey, string | undefined | null>>({
    layout: null,
    accent: null,
  });

  /*
    Follows every change to the storage, not only the ones this card makes: the Clear card on the same tab removes these keys too, and what the device holds is separate state that no value hook moves. Only the latest read is kept, since a change and the read it starts can overlap with the next.
  */
  useEffect(() => {
    let live = true;
    let latest = 0;

    const refresh = (): void => {
      const ticket = (latest += 1);

      void Promise.all([heldOnDevice("layout"), heldOnDevice("accent")]).then(
        ([layoutText, accentText]) => {
          if (live && ticket === latest) setHeld({ layout: layoutText, accent: accentText });
        },
      );
    };

    refresh();
    const stop = subscribeToStorage(local, refresh);

    return () => {
      live = false;
      stop();
    };
  }, []);

  const plantSample = (sample: Sample): void => {
    setPlanted((current) => ({ ...current, [sample.key]: sample.label }));
    /* Unknown until the device has been read again, so the verdict waits rather than judging the text from before the plant. */
    setHeld((current) => ({ ...current, [sample.key]: null }));
    void plantText(local.physicalKey(sample.key), sample.text).then(() => {
      /* AsyncStorage reports no changes, so the page is told by hand, which is what reads the key, and the device, again. */
      notifyStorageChanged(local, sample.key);
    });
  };

  const clear = (key: ShapeKey, remove: () => Promise<void>): void => {
    setPlanted((current) => ({ ...current, [key]: undefined }));
    void remove();
  };

  return (
    <Card
      title="Data that changes shape"
      lead="Plant what another release of this app would have stored. The key is read at once; compare what was planted with what is stored after."
      how={
        <>
          <Explain text={KEY_NOTES.layout.note} />
          <Explain text={KEY_NOTES.accent.note} />
          <Explain text="Planting tells the app the key changed, so every hook reading it reads it again. That read is what migrates or repairs the value and saves it, which is why the stored text changes without anything being written by hand." />
        </>
      }
    >
      <KeyGroup
        first
        storageKey="layout"
        stored={layout}
        held={held.layout}
        planted={planted.layout}
        onPlant={plantSample}
        onClear={() => clear("layout", () => layoutWriter.remove())}
      />
      <KeyGroup
        storageKey="accent"
        stored={accent}
        held={held.accent}
        planted={planted.accent}
        onPlant={plantSample}
        onClear={() => clear("accent", () => accentWriter.remove())}
      />
    </Card>
  );
}
