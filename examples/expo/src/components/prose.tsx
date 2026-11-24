import { Text } from "react-native";
import type { StyleProp, TextStyle } from "react-native";

import { usePalette } from "../hooks/use-palette";
import { MONO } from "../theme";

export interface ProseProps {
  /** A sentence in which backticks mark code, the way the shared notes are written. */
  readonly text: string;
  readonly style?: StyleProp<TextStyle>;
}

/** A shared note as one run of text, setting each backticked part in monospace rather than showing the backticks. Nested `Text` inherits the size and color around it. */
export function Prose({ text, style }: ProseProps) {
  return (
    <Text style={style}>
      {text.split("`").map((part, index) =>
        // oxlint-disable-next-line react/no-array-index-key -- A run's position in the sentence is its identity; the same word can appear twice.
        index % 2 === 1 ? <Code key={index}>{part}</Code> : part,
      )}
    </Text>
  );
}

interface CodeProps {
  readonly children: string;
}

/** A short run of code inside a sentence. */
function Code({ children }: CodeProps) {
  return <Text style={{ fontFamily: MONO }}>{children}</Text>;
}

export interface ExplainProps {
  readonly text: string;
}

/** One paragraph of a card's "How it works" sheet, sized for reading rather than for a row's caption. */
export function Explain({ text }: ExplainProps) {
  const palette = usePalette();

  return <Prose text={text} style={{ color: palette.body, fontSize: 15, lineHeight: 22 }} />;
}
