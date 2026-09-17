import { Text } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { MONO } from "../theme";

/**
 * A value rendered the way a console would show it, so `undefined`, `null` and `""` stay distinguishable.
 *
 * That distinction is the whole point in several panels: a key holding nothing, a key holding `null`, and a key holding an empty string are three different states this library keeps apart.
 */
function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

export interface ValueProps {
  readonly value: unknown;
}

export function Value({ value }: ValueProps) {
  const palette = usePalette();
  const empty = value === undefined || value === null;

  return (
    <Text
      style={{
        fontFamily: MONO,
        fontSize: 12,
        color: empty ? palette.soft : palette.success,
        fontStyle: empty ? "italic" : "normal",
      }}
    >
      {formatValue(value)}
    </Text>
  );
}
