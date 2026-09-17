import { Button } from "@expo/ui";
import { useState } from "react";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Pending } from "../components/pending";
import { plantText, readEverything } from "../store/raw";
import { local } from "../store/storages";

const FOREIGN_KEY = "analytics:session";

export function ClearPanel() {
  const [survived, setSurvived] = useState<boolean>();

  const check = async (): Promise<void> => {
    const entries = await readEverything();
    setSurvived(entries.some((entry) => entry.key === FOREIGN_KEY));
  };

  return (
    <Card
      title="clear() removes only what the schema declares"
      description="A device's storage is shared. Another library, an older version of this app, or a second storage over a different schema may be keeping things beside yours, and wiping it would take all of them."
    >
      <Field label="Plant a foreign key" hint={FOREIGN_KEY}>
        <Control>
          <Button
            variant="outlined"
            label="Plant"
            onPress={() => void plantText(FOREIGN_KEY, '"belongs to someone else"').then(check)}
          />
        </Control>
      </Field>

      <Field
        label="Then clear the schema's keys"
        hint="Every declared key goes; the foreign one is untouched, because the library removes what it declared one key at a time rather than emptying the store."
      >
        <Control>
          <Button
            variant="outlined"
            label="clear()"
            onPress={() => void local.clear().then(check)}
          />
        </Control>
      </Field>

      <Field label="Foreign key still there?">
        {survived === undefined ? (
          <Pending>not checked</Pending>
        ) : (
          <Badge tone={survived ? "success" : "danger"}>{survived ? "yes" : "gone"}</Badge>
        )}
      </Field>
    </Card>
  );
}
