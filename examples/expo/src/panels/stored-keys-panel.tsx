import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Entry, EntryList } from "../components/entry";
import { Note } from "../components/note";
import { usePalette } from "../hooks/use-palette";
import { useStoredKeys } from "../hooks/use-stored-keys";
import { MONO } from "../theme";

export function StoredKeysPanel() {
  const palette = usePalette();
  const entries = useStoredKeys();

  return (
    <Card
      title="What the device is actually holding"
      description="AsyncStorage read directly, past the library, the way devtools reads an origin. These are strings rather than values: this backend transports text, so what the device holds is the JSON the serializer produced."
      aside={<Badge>{entries.length} keys</Badge>}
    >
      <EntryList empty="Nothing stored yet. Every value on the Values tab is still its declared default, which is an answer the schema gives rather than anything the device holds.">
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

      <Note>
        The user object appears under app:user, because a physical key is what the device knows and
        the name the code uses never reaches it. Anything marked as not in the schema is what
        clear() is obliged to leave alone. This list re-reads whenever a write goes through the
        library and whenever this tab comes back into focus, which is how a value planted on the
        Resilience tab shows up: planting writes straight to the device, so the library never saw it
        and had nothing to announce.
      </Note>
    </Card>
  );
}
