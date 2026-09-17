import { appSchema, CORRUPTIONS, POLICIES } from "@examples/schema";
import type { AppKey, Corruption, PolicyName } from "@examples/schema";
import { Button, Picker } from "@expo/ui";
import { isPlatformStorageError } from "@platform-storage/react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Value } from "../components/value";
import { Note } from "../components/note";
import { Pending } from "../components/pending";
import { usePalette } from "../hooks/use-palette";
import { plantText, plantValue } from "../store/raw";
import { local, recovering } from "../store/storages";

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
type Outcome = ReadOutcome | FailedOutcome;

/** Writes past the library, the way a previous version of an app or a hand-edited database leaves behind. */
async function plant(corruption: Corruption): Promise<void> {
  const physical = appSchema.physicalKeys[corruption.key];

  if (corruption.kind === "text") await plantText(physical, corruption.text);
  else await plantValue(physical, corruption.value);
}

async function readWithPolicy(key: AppKey, policy: PolicyName): Promise<Outcome> {
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
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});

  return (
    <Card
      title="Persisted data outlives the code that wrote it"
      description="These write bad values straight through AsyncStorage, behind the library's back — what an older release of an app, or a database edited by hand, leaves on a device."
    >
      {/* The policy selector is a row rather than the card's aside: a picker wide enough to show a policy name leaves the title wrapping one word per line. */}
      <Field label="Invalid-data policy">
        <Control>
          <Picker
            selectedValue={policy}
            onValueChange={(next) => {
              setPolicy(next as PolicyName);
              setOutcomes({});
            }}
          >
            {POLICIES.map((option) => (
              <Picker.Item key={option.value} label={option.label} value={option.value} />
            ))}
          </Picker>
        </Control>
      </Field>

      {CORRUPTIONS.map((corruption) => {
        const outcome = outcomes[corruption.label];

        return (
          <Field
            key={corruption.label}
            label={corruption.label}
            hint={
              <View style={{ gap: 3 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                  <Badge tone={corruption.kind === "text" ? "warning" : "neutral"}>
                    {corruption.key}
                  </Badge>
                  {outcome === undefined ? (
                    <Pending>not read yet</Pending>
                  ) : outcome.kind === "read" ? (
                    <Value value={outcome.value} />
                  ) : (
                    <Badge tone="danger">{outcome.label}</Badge>
                  )}
                </View>
                <Text style={{ fontSize: 12, lineHeight: 17, color: palette.soft }}>
                  {corruption.explains}
                </Text>
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
                    setOutcomes((current) => ({ ...current, [corruption.label]: next }));
                  })
                }
              />
            </Control>
          </Field>
        );
      })}

      <Note>
        Whichever policy runs, the failure still reaches the onError observer, so a fallback is
        never silent — watch the log on the Inspector tab. The amber key is the one that is not JSON
        at all: it fails deserialization before validation is reached, which no other example in
        this repository can show, because their backends transport values rather than text.
      </Note>
    </Card>
  );
}
