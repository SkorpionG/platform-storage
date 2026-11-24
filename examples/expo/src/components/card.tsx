import type { ReactNode } from "react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { RADIUS, SPACE } from "../theme";
import { InfoButton } from "./info-button";
import { Sheet } from "./sheet";

export interface CardProps {
  readonly title: string;
  /** One line saying what to do with the card, in the imperative. */
  readonly lead?: string;
  /** How the card's behavior comes about. Opened from the `i` beside the title, so the card shows its controls first. */
  readonly how?: ReactNode;
  /** Sits opposite the title, for a count or a status the reader wants before the body. */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}

/**
 * One demonstration: a title, a line saying what to try, the rows that prove it, and the reasoning one tap away.
 *
 * The reasoning goes in a sheet rather than a disclosure that expands in place, because a card growing inside a scroll view moves everything under the reader's thumb.
 */
export function Card({ title, lead, how, aside, children }: CardProps) {
  const palette = usePalette();
  const [explaining, setExplaining] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
      <View style={[styles.header, { borderBottomColor: palette.line }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.fg }]}>{title}</Text>
          {lead === undefined ? null : (
            <Text style={[styles.lead, { color: palette.muted }]}>{lead}</Text>
          )}
        </View>
        <View style={styles.trailing}>
          {aside}
          {how === undefined ? null : (
            <InfoButton label={`How ${title} works`} onPress={() => setExplaining(true)} />
          )}
        </View>
      </View>
      <View style={styles.body}>{children}</View>

      {how === undefined ? null : (
        <Sheet title={title} visible={explaining} onClose={() => setExplaining(false)}>
          <View style={styles.how}>{how}</View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACE * 2, paddingVertical: SPACE * 1.5 },
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
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
  how: { gap: SPACE * 1.5, padding: SPACE * 0.5 },
  lead: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  title: { fontSize: 15, fontWeight: "600" },
  trailing: { alignItems: "center", flexDirection: "row", gap: SPACE },
});
