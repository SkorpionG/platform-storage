import { Button } from "@expo/ui";
import { useAsyncStorageValues } from "@platform-storage/react";
import { Text, View } from "react-native";

import { NotReady } from "../components/async-value";
import { Card } from "../components/card";
import { Control } from "../components/control";
import { Explain } from "../components/prose";
import { Value } from "../components/value";
import { usePalette } from "../hooks/use-palette";
import { local } from "../store/storages";
import { MONO, RADIUS } from "../theme";

/** The keys the hook reads, in the order the card lists them. */
const KEYS = ["displayName", "theme", "fontScale", "visitCount"] as const;

export function SummaryPanel() {
  const palette = usePalette();
  const [result, writer] = useAsyncStorageValues(local, KEYS);

  return (
    <Card
      title="Several keys through one hook"
      lead="One hook reads these four keys as one object. Change any of them on this tab, and the object follows."
      how={
        <>
          <Explain text="`useAsyncStorageValues` reads its keys in one call across the native bridge, with one status for all of them, and reads them again together whenever any one changes." />
          <Explain text="`writer.set` takes any of the four and writes them in one `setMany`, validating every value before writing any. `writer.remove()` removes every key the hook reads, so each one reads as its default again." />
        </>
      }
    >
      <View style={{ gap: 10 }}>
        <Text style={{ color: palette.body, fontFamily: MONO, fontSize: 11, lineHeight: 16 }}>
          useAsyncStorageValues(local, [{KEYS.map((key) => `"${key}"`).join(", ")}])
        </Text>

        {result.status === "ready" ? (
          <>
            <View
              style={{
                backgroundColor: palette.inset,
                borderRadius: RADIUS.inset,
                gap: 4,
                padding: 10,
              }}
            >
              {KEYS.map((key) => (
                <View key={key} style={{ flexDirection: "row", gap: 10 }}>
                  <Text style={{ color: palette.soft, fontFamily: MONO, fontSize: 12, width: 96 }}>
                    {key}
                  </Text>
                  <Value value={result.values[key]} />
                </View>
              ))}
            </View>

            <Text style={{ color: palette.body, fontSize: 14, lineHeight: 20 }}>
              {result.values.displayName ?? "Someone"} reads in {result.values.theme} at{" "}
              {Math.round(result.values.fontScale * 100)}%, and has visited{" "}
              {result.values.visitCount} {result.values.visitCount === 1 ? "time" : "times"}.
            </Text>
          </>
        ) : (
          <NotReady stored={result} />
        )}

        {/* Stacked, because each label is the call it makes, and the first is too long to share a row on a phone. */}
        <View style={{ alignItems: "flex-start", gap: 8 }}>
          <Control>
            <Button
              variant="outlined"
              label='writer.set({ theme: "dark", fontScale: 1.25 })'
              onPress={() => void writer.set({ theme: "dark", fontScale: 1.25 })}
            />
          </Control>
          <Control>
            <Button
              variant="outlined"
              label="writer.remove()"
              onPress={() => void writer.remove()}
            />
          </Control>
        </View>
      </View>
    </Card>
  );
}
