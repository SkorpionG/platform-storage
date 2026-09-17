import { appSchema, KEY_NOTES } from "@examples/schema";
import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { usePalette } from "../hooks/use-palette";
import { MONO } from "../theme";

export function SchemaPanel() {
  const palette = usePalette();

  return (
    <Card
      title="One schema, every platform"
      description="This definition lives in its own package with no DOM types and no React. The two browser demos and the extension import the very same file; nothing in it knows these values are about to live on a phone."
    >
      {appSchema.keys.map((key) => {
        const note = KEY_NOTES[key];
        const physical = appSchema.physicalKeys[key];

        return (
          <Field
            key={key}
            label={note.label}
            hint={
              <View style={{ gap: 3 }}>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.soft }}>
                  {note.readType}
                </Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: palette.soft }}>
                  {note.note}
                </Text>
              </View>
            }
          >
            {physical === key ? null : <Badge tone="info">{physical}</Badge>}
          </Field>
        );
      })}
    </Card>
  );
}
