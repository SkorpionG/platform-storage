import { Children } from "react";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { RADIUS } from "../theme";

export interface EntryProps {
  readonly children: ReactNode;
}

/** One record in a list of them: a stored key, or a failure the observer saw. Inset rather than bordered, because these are raw and the rows around them are not. */
export function Entry({ children }: EntryProps) {
  const palette = usePalette();

  return (
    <View
      style={{ backgroundColor: palette.inset, borderRadius: RADIUS.inset, gap: 4, padding: 8 }}
    >
      {children}
    </View>
  );
}

export interface EntryListProps {
  /** What to say when there is nothing to list, which is the state both lists start in and say something different about. */
  readonly empty: string;
  readonly children: ReactNode;
}

export function EntryList({ empty, children }: EntryListProps) {
  const palette = usePalette();

  if (Children.count(children) === 0) {
    return (
      <Text style={{ fontSize: 12, lineHeight: 17, color: palette.faint, paddingVertical: 6 }}>
        {empty}
      </Text>
    );
  }

  return <View style={{ gap: 8, paddingVertical: 4 }}>{children}</View>;
}
