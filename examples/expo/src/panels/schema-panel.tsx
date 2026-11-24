import { appSchema, KEY_NOTES } from "@examples/schema";
import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Prose } from "../components/prose";
import { usePalette } from "../hooks/use-palette";
import { MONO } from "../theme";

export function SchemaPanel() {
  const palette = usePalette();

  return (
    <Card
      title="The schema"
      lead="Every key, the name it is stored under when that differs, and what a read returns. The browser examples and the extension import this very file."
    >
      {appSchema.keys.map((key, index) => {
        const note = KEY_NOTES[key];
        const physical = appSchema.physicalKeys[key];

        return (
          <Field
            key={key}
            first={index === 0}
            label={note.label}
            hint={
              <View style={{ gap: 3 }}>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.soft }}>
                  {note.readType}
                </Text>
                <Prose
                  text={note.note}
                  style={{ fontSize: 12, lineHeight: 17, color: palette.soft }}
                />
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
