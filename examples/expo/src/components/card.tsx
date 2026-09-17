import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { RADIUS, SPACE } from "../theme";

export interface CardProps {
  readonly title: string;
  readonly description?: string;
  /** Sits opposite the title, for a count or a status the reader wants before the body. */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}

/** One demonstration: a title, a sentence saying what it proves, and the rows that prove it. */
export function Card({ title, description, aside, children }: CardProps) {
  const palette = usePalette();

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
      <View style={[styles.header, { borderBottomColor: palette.line }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.fg }]}>{title}</Text>
          {description === undefined ? null : (
            <Text style={[styles.description, { color: palette.muted }]}>{description}</Text>
          )}
        </View>
        {aside}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACE * 2, paddingVertical: SPACE * 1.5 },
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  header: {
    alignItems: "flex-start",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: SPACE,
    justifyContent: "space-between",
    paddingHorizontal: SPACE * 2,
    paddingVertical: SPACE * 1.5,
  },
  headerText: { flexShrink: 1 },
  title: { fontSize: 15, fontWeight: "600" },
});
