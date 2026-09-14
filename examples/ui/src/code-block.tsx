"use client";

/*
  Lines and tokens are keyed by index. The rule guards against a list reordering under its keys, which these cannot: they are a pure function of a constant string, nothing is inserted, and no element here holds state that could follow the wrong key.
*/
// oxlint-disable react/no-array-index-key

import { Highlight } from "prism-react-renderer";
import type { PrismTheme } from "prism-react-renderer";

import { cn } from "./cn";

/*
  An empty theme, so the highlighter emits its `token` class names and no inline colors at all. The colors come from `theme.css` instead, which is what lets them follow the same palette as the rest of the page and swap with it in dark mode; a theme object here would hard-code one set of colors into the markup.
*/
const TOKENS_ONLY: PrismTheme = { plain: {}, styles: [] };

export interface CodeBlockProps {
  readonly code: string;
  readonly className?: string | undefined;
}

/** A module shown verbatim, highlighted. */
export function CodeBlock({ code, className }: CodeBlockProps) {
  return (
    <Highlight code={code} language="tsx" theme={TOKENS_ONLY}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre
          className={cn(
            "overflow-x-auto rounded-lg border border-line bg-inset p-3 font-mono text-[11px] leading-relaxed text-body",
            className,
          )}
        >
          {tokens.map((line, index) => (
            <div key={index} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
