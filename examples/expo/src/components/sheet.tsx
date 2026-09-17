import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { SPACE } from "../theme";

export interface SheetProps {
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Reference material shown over a tab, for what is worth reading but not worth the room it would take permanently.
 *
 * A modal rather than a route, because a route would need a navigation stack around the tabs, and on iOS a native stack restores whatever held the keyboard before each transition.
 */
export function Sheet({ title, visible, onClose, children }: SheetProps) {
  const palette = usePalette();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ backgroundColor: palette.canvas, flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: palette.line }]}>
          <Text style={[styles.title, { color: palette.fg }]}>{title}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
            <Text style={[styles.done, { color: palette.accent }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE * 1.5, paddingBottom: SPACE * 4 },
  done: { fontSize: 16 },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACE * 2,
    paddingVertical: SPACE * 1.5,
  },
  title: { fontSize: 18, fontWeight: "700" },
});
