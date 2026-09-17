import { TextInput, useNativeState } from "@expo/ui";
import { useEffect } from "react";

import { Control } from "./control";

export interface TextRowProps {
  /** What the key currently holds, once the read has landed. */
  readonly value: string;
  readonly placeholder?: string;
  /** Called on blur rather than per keystroke. */
  readonly onCommit: (next: string) => void;
}

/**
 * A text field over a value that arrives later.
 *
 * `@expo/ui`'s `TextInput` takes an observable rather than a string, which the field owns while it has focus. It is committed on blur rather than per keystroke: writing every character would send the value round through storage and back, and the read landing a keystroke behind would drag the cursor with it.
 */
export function TextRow({ value, placeholder, onCommit }: TextRowProps) {
  const text = useNativeState(value);

  /* A value changed somewhere else — cleared, or planted behind the library's back — still has to reach the field. Comparing first leaves whatever the user is typing alone. */
  useEffect(() => {
    /*
      oxlint-disable-next-line react/immutability -- Assigning to `.value` is how `useNativeState` is driven: it hands back a mutable observable so the field can update on the UI thread without a React render, which is the opposite of the state object this rule is about.
    */
    if (text.value !== value) text.value = value;
  }, [value, text]);

  return (
    <Control>
      <TextInput
        value={text}
        placeholder={placeholder ?? "unset"}
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => onCommit(text.value)}
        onSubmitEditing={() => onCommit(text.value)}
      />
    </Control>
  );
}
