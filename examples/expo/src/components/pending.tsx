import type { ReactNode } from "react";
import { Text } from "react-native";

import { usePalette } from "../hooks/use-palette";

export interface PendingProps {
  readonly children: ReactNode;
}

/** Stands where a value will go once something has been read or pressed. Italic and faint so it never reads as the answer. */
export function Pending({ children }: PendingProps) {
  const palette = usePalette();

  return (
    <Text style={{ fontSize: 12, fontStyle: "italic", color: palette.faint }}>{children}</Text>
  );
}
