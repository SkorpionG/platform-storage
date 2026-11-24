import { useState } from "react";
import { Pressable, Text } from "react-native";

import { Screen } from "../components/screen";
import { Sheet } from "../components/sheet";
import { usePalette } from "../hooks/use-palette";
import { SchemaPanel } from "../panels/schema-panel";
import { SummaryPanel } from "../panels/summary-panel";
import { ValuesPanel } from "../panels/values-panel";

export function Values() {
  const palette = usePalette();
  const [schemaShown, setSchemaShown] = useState(false);

  return (
    <>
      <Screen
        title="Values"
        intro="Every kind of value, read from and written to this device."
        action={
          /* A word rather than the `i` a card uses for its own explanation, so the two never look like the same thing. */
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSchemaShown(true)}>
            <Text style={{ color: palette.accent, fontSize: 16, fontWeight: "500" }}>Schema</Text>
          </Pressable>
        }
      >
        <ValuesPanel />
        <SummaryPanel />
      </Screen>

      <Sheet title="Schema" visible={schemaShown} onClose={() => setSchemaShown(false)}>
        <SchemaPanel />
      </Sheet>
    </>
  );
}
