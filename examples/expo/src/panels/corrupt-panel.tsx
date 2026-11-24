import { CORRUPTIONS, POLICIES } from "@examples/schema";
import type { AppKey, Corruption, PolicyName } from "@examples/schema";
import { Button, Picker } from "@expo/ui";
import { notifyStorageChanged } from "@platform-storage/react";
import { isPlatformStorageError } from "@platform-storage/react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Outcome } from "../components/outcome";
import { Pending } from "../components/pending";
import { Explain, Prose } from "../components/prose";
import { Value } from "../components/value";
import { usePalette } from "../hooks/use-palette";
import { useStoredKeys } from "../hooks/use-stored-keys";
import { plantText } from "../store/raw";
import { failuresSoFar, local, recovering } from "../store/storages";
import { MONO } from "../theme";

/*
  Every corruption, both kinds. The extension example has to filter this list down to `kind: "value"`, because an area transports JSON values and there is no encoding step left to fail in. AsyncStorage transports text, so the entry that is not JSON at all belongs here: it is the one case in the repository where deserialization fails before validation is ever reached.
*/

interface ReadOutcome {
  readonly kind: "read";
  readonly value: unknown;
}
interface FailedOutcome {
  readonly kind: "failed";
  readonly label: string;
}
type ReadResult = (ReadOutcome | FailedOutcome) & {
  /** Whether a failure was reported while the read ran, which is what keeps a fallback from being silent. */
  readonly logged: boolean;
};

/** The text a corruption leaves on the device, which is what the row says it will plant. */
function plantedText(corruption: Corruption): string {
  return corruption.kind === "text" ? corruption.text : JSON.stringify(corruption.value);
}

/*
  Writes past the library, the way a previous version of an app or a hand-edited database leaves behind. AsyncStorage reports no changes, so the page is told by hand, which is what makes every hook reading the key read it again.
*/
async function plant(corruption: Corruption): Promise<void> {
  await plantText(local.physicalKey(corruption.key), plantedText(corruption));
  notifyStorageChanged(local, corruption.key);
}

async function readWithPolicy(key: AppKey, policy: PolicyName): Promise<ReadResult> {
  const before = failuresSoFar();
  const read = await attempt(key, policy);

  /* Under `remove` the read deleted the entry, so the page has to look again. */
  notifyStorageChanged(local, key);

  return { ...read, logged: failuresSoFar() > before };
}

async function attempt(key: AppKey, policy: PolicyName): Promise<ReadOutcome | FailedOutcome> {
  try {
    /* The callback policy lives on a storage of its own, because a per-call callback is checked against the one key being read and this reads whichever key the row names. */
    const value =
      policy === "callback"
        ? await recovering.get(key)
        : await local.get(key, { onInvalid: policy });

    return { kind: "read", value };
  } catch (error) {
    return {
      kind: "failed",
      label: isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
    };
  }
}

export function CorruptPanel() {
  const palette = usePalette();
  const [policy, setPolicy] = useState<PolicyName>("fallback");
  const [results, setResults] = useState<Readonly<Record<string, ReadResult>>>({});
  const entries = useStoredKeys();

  const storedNow = (key: AppKey): string | undefined =>
    entries.find((entry) => entry.key === local.physicalKey(key))?.text;

  return (
    <Card
      title="Corrupt data"
      lead="Pick a policy, plant a bad value, then read it back. Planting alone already adds to the error log, because the Values tab reads the same key."
      how={
        <>
          <Explain text="Plant writes straight through AsyncStorage, behind the library's back: what an older release of an app, or a database edited by hand, leaves on a device. Every hook reading that key reads it again, falls back and reports it, which is why the error log moves before you press Read." />
          <Explain text="Read uses the policy you picked. `fallback` answers with the default and leaves the bad value stored. `throw` rejects the read. `remove` deletes the stored value, then falls back. The callback decides per read, and here answers with the declared default." />
          <Explain text="`{not json` is the one value no other example can show: this backend stores text, so it fails to parse before validation is ever reached." />
          <Explain text="Reads here are asynchronous, so a hook re-reading the same key at that moment can also mark a read as logged." />
        </>
      }
    >
      {/* The policy selector is a row rather than the card's aside: a picker wide enough to show a policy name leaves the title wrapping one word per line. */}
      <Field first stacked label="Invalid-data policy">
        <Control>
          <Picker
            selectedValue={policy}
            onValueChange={(next) => {
              setPolicy(next as PolicyName);
              setResults({});
            }}
          >
            {POLICIES.map((option) => (
              <Picker.Item key={option.value} label={option.label} value={option.value} />
            ))}
          </Picker>
        </Control>
      </Field>

      {CORRUPTIONS.map((corruption) => {
        const result = results[corruption.label];
        const stored = storedNow(corruption.key);

        return (
          <Field
            key={corruption.label}
            label={corruption.label}
            hint={
              <View style={{ gap: 4 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                  <Badge tone={corruption.kind === "text" ? "warning" : "neutral"}>
                    {corruption.key}
                  </Badge>
                  <Prose
                    text={corruption.explains}
                    style={{ color: palette.soft, flexShrink: 1, fontSize: 12, lineHeight: 17 }}
                  />
                </View>
                <Outcome label="Plants">
                  <Text style={{ color: palette.body, fontFamily: MONO, fontSize: 11 }}>
                    {plantedText(corruption)}
                  </Text>
                </Outcome>
                <Outcome label="Stored now">
                  {stored === undefined ? (
                    <Pending>nothing</Pending>
                  ) : (
                    <Text style={{ color: palette.body, fontFamily: MONO, fontSize: 11 }}>
                      {stored}
                    </Text>
                  )}
                </Outcome>
                <Outcome label="Read">
                  {result === undefined ? (
                    <Pending>not yet</Pending>
                  ) : (
                    <>
                      {result.kind === "read" ? (
                        <Value value={result.value} />
                      ) : (
                        <Badge tone="danger">{result.label}</Badge>
                      )}
                      {result.logged ? <Badge tone="info">logged</Badge> : null}
                    </>
                  )}
                </Outcome>
              </View>
            }
          >
            <Control>
              <Button variant="outlined" label="Plant" onPress={() => void plant(corruption)} />
            </Control>
            <Control>
              <Button
                variant="outlined"
                label="Read"
                onPress={() =>
                  void readWithPolicy(corruption.key, policy).then((next) => {
                    setResults((current) => ({ ...current, [corruption.label]: next }));
                  })
                }
              />
            </Control>
          </Field>
        );
      })}
    </Card>
  );
}
