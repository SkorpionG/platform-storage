import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import type { Palette } from "../theme";
import { MONO, RADIUS } from "../theme";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

function colorFor(tone: BadgeTone, palette: Palette): string {
  if (tone === "info") return palette.accent;
  if (tone === "success") return palette.success;
  if (tone === "warning") return palette.warning;
  if (tone === "danger") return palette.danger;
  return palette.muted;
}

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}

/** A short machine-ish fact: a key, a code, a count. Monospace, because most of what goes in one is an identifier. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  const palette = usePalette();
  const color = colorFor(tone, palette);

  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: color,
        borderRadius: RADIUS.badge,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontFamily: MONO, fontSize: 11, color }}>{children}</Text>
    </View>
  );
}
