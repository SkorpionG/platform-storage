import { useState } from "react";

import { InfoButton } from "../components/info-button";
import { Screen } from "../components/screen";
import { Sheet } from "../components/sheet";
import { SchemaPanel } from "../panels/schema-panel";
import { ValuesPanel } from "../panels/values-panel";

export function Values() {
  const [schemaShown, setSchemaShown] = useState(false);

  return (
    <>
      <Screen
        title="Values"
        intro="Every kind of value the schema declares, read from and written to this device's AsyncStorage."
        action={<InfoButton label="Show the schema" onPress={() => setSchemaShown(true)} />}
      >
        <ValuesPanel />
      </Screen>

      <Sheet title="Schema" visible={schemaShown} onClose={() => setSchemaShown(false)}>
        <SchemaPanel />
      </Sheet>
    </>
  );
}
