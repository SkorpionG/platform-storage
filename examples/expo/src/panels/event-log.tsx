import { Button } from "@expo/ui";
import { clearStorageErrors, useStorageErrors } from "@platform-storage/react";
import { STORAGE_ERROR_CODE } from "@platform-storage/react-native";
import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import type { BadgeTone } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Entry, EntryList } from "../components/entry";
import { usePalette } from "../hooks/use-palette";

function toneFor(code: string): BadgeTone {
  if (code === STORAGE_ERROR_CODE.Validation || code === STORAGE_ERROR_CODE.Serialization) {
    return "warning";
  }
  if (code === STORAGE_ERROR_CODE.Unavailable || code === STORAGE_ERROR_CODE.Adapter) {
    return "danger";
  }
  return "neutral";
}

export function EventLog() {
  const palette = usePalette();
  const entries = useStorageErrors();

  return (
    <Card
      title="Every failure, including the handled ones"
      description="The onError observer sees each failure whichever policy runs, which is what keeps a falling-back read from being a silent one."
      aside={
        entries.length === 0 ? (
          <Badge tone="success">0</Badge>
        ) : (
          <Control>
            <Button variant="outlined" label="Clear" onPress={clearStorageErrors} />
          </Control>
        )
      }
    >
      <EntryList empty="Nothing has failed yet. Plant a corruption on the Resilience tab and read it back.">
        {entries.map((entry) => (
          <Entry key={entry.id}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <Badge tone={toneFor(entry.error.code)}>{entry.error.code}</Badge>
              {entry.count === 1 ? null : <Badge>×{entry.count}</Badge>}
              <Text style={{ fontSize: 11, color: palette.faint }}>
                {new Date(entry.at).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={{ fontSize: 11, lineHeight: 16, color: palette.muted }}>
              {entry.error.message}
            </Text>
          </Entry>
        ))}
      </EntryList>
    </Card>
  );
}
