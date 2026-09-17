import { Text } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Note } from "../components/note";
import { usePalette } from "../hooks/use-palette";
import { failing, local } from "../store/storages";
import { MONO } from "../theme";

export function NativeModulePanel() {
  const palette = usePalette();
  const wire = local.adapter.serializer.serialize("dark");

  return (
    <Card
      title="Nothing to resolve, and no native module imported"
      description="The extension package looks for a global on every operation, because an extension API may not have arrived yet. This one is handed the instance instead, so there is no lookup to show — and nothing here imports a native module, which is what keeps the package loadable under a test runner and on a server."
    >
      <Field
        label="adapter.name"
        hint="What the adapter calls itself, which is the name every error message reports."
      >
        <Badge tone="info">{local.adapter.name}</Badge>
      </Field>

      <Field
        label="The same library over no device at all"
        hint="The refusing storage on the Resilience tab is built over an object literal with three methods and nothing behind them. The library cannot tell it from the real one, because it never went looking for one."
      >
        <Badge tone="info">{failing.adapter.name}</Badge>
      </Field>

      <Field
        label="What the backend is handed"
        hint={`The adapter's own serializer, run on the string "dark". An extension area is handed the value itself; this one is handed text, and that encoding step is what a hand-edited entry can fail to parse back out of.`}
      >
        <Badge tone="info">{typeof wire}</Badge>
        <Text style={{ fontFamily: MONO, fontSize: 12, color: palette.success }}>
          {String(wire)}
        </Text>
      </Field>

      <Field
        label={`physicalKey("user")`}
        hint="The key the device stores under, which the schema renamed. It is the name the list below shows, because the device knows nothing about the one the code uses."
      >
        <Badge tone="info">{local.physicalKey("user")}</Badge>
      </Field>

      <Note>
        Which AsyncStorage to use is the application&apos;s decision here rather than the
        library&apos;s. That is the cost of having nothing to resolve, and also what lets a storage
        be built over a refusing stub, a fake in a test, or whatever else already holds an
        app&apos;s data.
      </Note>
    </Card>
  );
}
