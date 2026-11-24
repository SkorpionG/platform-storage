import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { SPACE } from "../theme";

export interface FieldProps {
  readonly label: string;
  /** Sits under the row, which is where the read type, the current value and the note go. */
  readonly hint?: ReactNode;
  readonly children?: ReactNode;
  /** The card's first row, which sits under the header's own rule and so draws no rule of its own. React Native has no `:first-child` to work that out. */
  readonly first?: boolean;
  /** Puts the controls on a line of their own under the label, for a control or a value too wide to share the row. A native control cannot shrink to fit, so beside the label it would run off the card. */
  readonly stacked?: boolean;
}

/** One labeled row. Rows stack inside a card and separate themselves, so a panel does not have to draw its own dividers. */
export function Field({ label, hint, children, first = false, stacked = false }: FieldProps) {
  const palette = usePalette();

  return (
    <View style={[styles.row, { borderTopColor: palette.line }, first ? styles.first : null]}>
      {stacked ? (
        <>
          <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
          {children === undefined ? null : <View style={styles.stacked}>{children}</View>}
        </>
      ) : (
        <View style={styles.head}>
          <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
          <View style={styles.control}>{children}</View>
        </View>
      )}
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
  first: { borderTopWidth: 0, paddingTop: 0 },
  stacked: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACE,
    marginTop: SPACE * 0.75,
  },
  /* A rule above every row separates it from the one before; the first row opts out with `first`, since the header's rule is already there. */
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: SPACE * 1.25 },
});
