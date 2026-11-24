import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Entry, EntryList } from "../components/entry";
import { usePalette } from "../hooks/use-palette";
import { useStoredKeys } from "../hooks/use-stored-keys";
import { Explain } from "../components/prose";
import { MONO } from "../theme";

export function StoredKeysPanel() {
  const palette = usePalette();
  const entries = useStoredKeys();

  return (
    <Card
      title="What the device is actually holding"
      lead="Everything AsyncStorage holds, as the text it stores, under the names it is stored as."
      how={
        <>
          <Explain text="Listed through the adapter, below the schema, the way devtools reads an origin. These are strings rather than values: this backend transports text, so what the device holds is the JSON the serializer produced." />
          <Explain text="The user object appears under `app:user`, because a physical key is what the device knows. Anything marked as not in the schema is what `clear()` is obliged to leave alone." />
          <Explain text="The list reads again whenever a write goes through the library and whenever this tab comes back into focus." />
        </>
      }
      aside={<Badge>{`${String(entries.length)} ${entries.length === 1 ? "key" : "keys"}`}</Badge>}
    >
      <EntryList empty="Nothing stored yet. Every value on the Values tab is its declared default.">
        {entries.map((entry) => (
          <Entry key={entry.key}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <Badge tone={entry.ours ? "info" : "neutral"}>{entry.key}</Badge>
              {entry.ours ? null : (
                <Text style={{ fontSize: 11, color: palette.faint }}>not in the schema</Text>
              )}
            </View>
            <Text
              numberOfLines={2}
              style={{ fontFamily: MONO, fontSize: 11, lineHeight: 16, color: palette.muted }}
            >
              {entry.text}
            </Text>
          </Entry>
        ))}
      </EntryList>
    </Card>
  );
}
