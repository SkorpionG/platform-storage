import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";

export interface OutcomeProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** One result inside a card: what was checked, then what came back. */
export function Outcome({ label, children }: OutcomeProps) {
  const palette = usePalette();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Text style={{ color: palette.soft, fontSize: 12 }}>{label}</Text>
      {children}
    </View>
  );
}
