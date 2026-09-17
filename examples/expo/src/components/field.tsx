import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { SPACE } from "../theme";

export interface FieldProps {
  readonly label: string;
  /** Sits under the row, which is where the read type, the current value and the note go. */
  readonly hint?: ReactNode;
  readonly children?: ReactNode;
}

/** One labeled row. Rows stack inside a card and separate themselves, so a panel does not have to draw its own dividers. */
export function Field({ label, hint, children }: FieldProps) {
  const palette = usePalette();

  return (
    <View style={[styles.row, { borderTopColor: palette.line }]}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
        <View style={styles.control}>{children}</View>
      </View>
      {hint === undefined ? null : (
        <View style={styles.hint}>
          {/* A bare string is legal inside a `div` and fatal inside a `View`, so prose is wrapped here rather than at every call site. */}
          {typeof hint === "string" ? (
            <Text style={[styles.hintText, { color: palette.soft }]}>{hint}</Text>
          ) : (
            hint
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  control: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: SPACE },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: SPACE,
    justifyContent: "space-between",
  },
  hint: { gap: 3, marginTop: 5 },
  hintText: { fontSize: 12, lineHeight: 17 },
  label: { flexShrink: 1, fontSize: 14, fontWeight: "500" },
  /* The first row in a card sits against the header's own rule, so the top border is what separates every row after it. */
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: SPACE * 1.25 },
});
