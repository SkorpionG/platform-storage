import { storedNamesOf } from "@examples/schema";
import { Button } from "@expo/ui";
import { notifyStorageChanged } from "@platform-storage/react";
import { useState } from "react";
import { Text, View } from "react-native";

import { Badge } from "../components/badge";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Field } from "../components/field";
import { Outcome } from "../components/outcome";
import { Pending } from "../components/pending";
import { Explain } from "../components/prose";
import { usePalette } from "../hooks/use-palette";
import { useStoredKeys } from "../hooks/use-stored-keys";
import { plantText, readEverything } from "../store/raw";
import { local, recovering, tour } from "../store/storages";
import { MONO, RADIUS } from "../theme";

const FOREIGN_KEY = "analytics:session";
const DECLARED = storedNamesOf([local]);

interface LastRun {
  readonly call: string;
  readonly removed: ReadonlyArray<string>;
}

async function namesOnDevice(): Promise<ReadonlySet<string>> {
  return new Set((await readEverything()).map((entry) => entry.key));
}

/** Runs a clear and reports which names it took, by listing the device either side of it. */
async function measure(call: string, run: () => Promise<void>): Promise<LastRun> {
  const before = await namesOnDevice();
  await run();
  const after = await namesOnDevice();

  return { call, removed: [...before].filter((name) => !after.has(name)) };
}

export function ClearPanel() {
  const palette = usePalette();
  const entries = useStoredKeys();
  const [last, setLast] = useState<LastRun>();

  const declared = entries.filter((entry) => DECLARED.has(entry.key)).length;
  const foreign = entries.some((entry) => entry.key === FOREIGN_KEY);

  const clear = (call: string, run: () => Promise<void>): void => {
    void measure(call, run).then(setLast);
  };

  return (
    <Card
      title="Clear"
      lead="Plant a key that belongs to someone else, then try each clear and see what it took."
      how={
        <>
          <Explain text="A device's storage is shared. Another library, an older version of this app, or a second storage over a different schema may keep things beside yours, so anything wider than the schema has to be asked for by name." />
          <Explain text='`clear()` removes only the names the schema declares, in one call where AsyncStorage has one. `clear("undeclared")` lists the store and removes every name the schema does not list; this storage has no prefix to stay inside, so the foreign key goes too.' />
          <Explain
            text={`\`clear("everything")\` is one call to AsyncStorage's own \`clear()\`. AsyncStorage reports no changes, so the storage that ran it announces its own keys, and this card tells the other storages over the same store itself.`}
          />
        </>
      }
    >
      <View
        style={{
          backgroundColor: palette.inset,
          borderRadius: RADIUS.inset,
          gap: 6,
          marginBottom: 4,
          padding: 10,
        }}
      >
        <Outcome label="Schema keys on the device">
          <Badge>{declared}</Badge>
        </Outcome>
        <Outcome label={FOREIGN_KEY}>
          <Badge tone={foreign ? "info" : "neutral"}>{foreign ? "present" : "absent"}</Badge>
        </Outcome>
        {last === undefined ? null : (
          <Outcome label={last.call}>
            {last.removed.length === 0 ? (
              <Pending>removed nothing</Pending>
            ) : (
              <Text style={{ color: palette.body, fontFamily: MONO, fontSize: 11, flexShrink: 1 }}>
                removed {last.removed.length}: {last.removed.join(", ")}
              </Text>
            )}
          </Outcome>
        )}
      </View>

      <Field stacked label="Plant a foreign key">
        <Control>
          <Button
            variant="outlined"
            label="Plant"
            onPress={() =>
              void plantText(FOREIGN_KEY, '"belongs to someone else"').then(() => {
                /* Planting goes past the library, so nothing announces it. */
                notifyStorageChanged(local);
              })
            }
          />
        </Control>
      </Field>

      <Field stacked label="Only the schema's keys">
        <Control>
          <Button
            variant="outlined"
            label="clear()"
            onPress={() => clear("clear()", () => local.clear())}
          />
        </Control>
      </Field>

      <Field stacked label="Everything the schema does not declare">
        <Control>
          <Button
            variant="outlined"
            label='clear("undeclared")'
            onPress={() =>
              clear('clear("undeclared")', async () => {
                await local.clear("undeclared");
                /* No declared key changed, so nothing announced it. */
                notifyStorageChanged(local);
              })
            }
          />
        </Control>
      </Field>

      <Field stacked label="The whole store">
        <Control>
          <Button
            variant="outlined"
            label='clear("everything")'
            onPress={() =>
              clear('clear("everything")', async () => {
                await local.clear("everything");
                notifyStorageChanged(recovering);
                notifyStorageChanged(tour);
              })
            }
          />
        </Control>
      </Field>
    </Card>
  );
}
