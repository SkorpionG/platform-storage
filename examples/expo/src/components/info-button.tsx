import { Pressable, StyleSheet, Text } from "react-native";

import { usePalette } from "../hooks/use-palette";

export interface InfoButtonProps {
  /** Read out in place of the glyph, which carries no meaning on its own. */
  readonly label: string;
  readonly onPress: () => void;
}

/** Opens a tab's reference material. Drawn rather than an SF Symbol, because the glyph has to be the same on both platforms. */
export function InfoButton({ label, onPress }: InfoButtonProps) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={[styles.button, { borderColor: palette.accent }]}
    >
      <Text style={[styles.glyph, { color: palette.accent }]}>i</Text>
    </Pressable>
  );
}

/* A circle, so the radius is half the size rather than a number from the corner scale. */
const SIZE = 26;

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    height: SIZE,
    justifyContent: "center",
    width: SIZE,
  },
  /* No family named: the system font is the only one both platforms are guaranteed to resolve. */
  glyph: { fontSize: 15, fontStyle: "italic", fontWeight: "700" },
});
