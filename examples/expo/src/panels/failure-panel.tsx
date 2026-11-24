import { Button } from "@expo/ui";
import { isPlatformStorageError } from "@platform-storage/react-native";
import { useState } from "react";
import { Text } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Pending } from "../components/pending";
import { Explain } from "../components/prose";
import { usePalette } from "../hooks/use-palette";
import { failing } from "../store/storages";
import { MONO } from "../theme";

export function FailurePanel() {
  const palette = usePalette();
  const [outcome, setOutcome] = useState<string>();
  const [cause, setCause] = useState<string>();

  const attempt = (): void => {
    void failing
      .set("displayName", "Ada")
      .then(() => {
        setOutcome("written");
        setCause(undefined);
      })
      .catch((error: unknown) => {
        setOutcome(isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error");
        setCause(
          error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
        );
      });
  };

  return (
    <Card
      title="A device that refuses"
      lead="Write through a storage whose device rejects every call, and see what comes back."
      how={
        <>
          <Explain text="This storage sits over an AsyncStorage whose every call rejects, which is what the native module does when the disk is full or the database will not open." />
          <Explain text="The rejection is not softened into a fallback: the invalid-data policy governs data that parsed and failed validation, not a backend that would not answer at all. It arrives as `StorageAdapterError`, with the device's own error kept as its `cause`." />
        </>
      }
    >
      <Field first label='set("displayName", "Ada")'>
        <Control>
          <Button variant="outlined" label="set()" onPress={attempt} />
        </Control>
      </Field>

      <Field label="What came back">
        {outcome === undefined ? (
          <Pending>not run</Pending>
        ) : (
          <Badge tone="danger">{outcome}</Badge>
        )}
      </Field>

      {cause === undefined ? null : (
        <Field label="cause" hint="The device's own words, kept.">
          <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.muted }}>{cause}</Text>
        </Field>
      )}
    </Card>
  );
}
