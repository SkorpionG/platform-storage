import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { SPACE } from "../theme";

export interface ScreenProps {
  readonly title: string;
  readonly intro: string;
  /** Sits beside the title, for the one thing this tab offers that is not a card. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

/**
 * One tab's body: a title, a sentence saying what it is for, and a column of cards.
 *
 * A `ScrollView` as the screen's first child, because the native tab bar measures it to decide whether to draw itself opaque, and wrapping it in anything hides that.
 */
export function Screen({ title, intro, action, children }: ScreenProps) {
  const palette = usePalette();

  return (
    <ScrollView
      style={{ backgroundColor: palette.canvas }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.fg }]}>{title}</Text>
          {action}
        </View>
        <Text style={[styles.intro, { color: palette.muted }]}>{intro}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACE * 1.5, padding: SPACE * 1.5, paddingBottom: SPACE * 5 },
  header: { gap: 4, paddingHorizontal: SPACE / 2, paddingTop: SPACE },
  intro: { fontSize: 14, lineHeight: 20 },
  title: { flexShrink: 1, fontSize: 26, fontWeight: "700", letterSpacing: -0.3 },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: SPACE,
    justifyContent: "space-between",
  },
});
