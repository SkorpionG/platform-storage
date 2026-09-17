import type { ReactNode } from "react";
import { Text } from "react-native";

import { usePalette } from "../hooks/use-palette";

export interface NoteProps {
  readonly children: ReactNode;
}

/** The closing paragraph of a card, where the point the panel is making gets said in words. */
export function Note({ children }: NoteProps) {
  const palette = usePalette();

  return (
    <Text style={{ fontSize: 12, lineHeight: 17, color: palette.soft, paddingTop: 10 }}>
      {children}
    </Text>
  );
}
