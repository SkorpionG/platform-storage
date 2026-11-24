import type { ReactNode } from "react";

import { cn } from "./cn";

export interface CodeProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** A short run of code inside a sentence. */
export function Code({ children, className }: CodeProps) {
  return (
    <code
      className={cn("rounded bg-raised px-1 py-0.5 font-mono text-[11px] text-body", className)}
    >
      {children}
    </code>
  );
}

/**
 * A value rendered the way the console would show it, so `undefined`, `null` and `""` stay distinguishable.
 *
 * That distinction is the whole point in several panels: a key holding nothing, a key holding `null`, and a key holding an empty string are three different states this library keeps apart.
 */
export function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

export interface ValueProps {
  readonly value: unknown;
}

export function Value({ value }: ValueProps) {
  const empty = value === undefined || value === null;

  return (
    <span
      className={cn(
        "font-mono text-xs",
        empty ? "text-soft italic" : "text-emerald-700 dark:text-emerald-300",
      )}
    >
      {formatValue(value)}
    </span>
  );
}

export interface ProseProps {
  /** A sentence in which backticks mark code, the way the shared notes are written. */
  readonly text: string;
}

/** Renders a shared note, setting each backticked run as code rather than showing the backticks. */
export function Prose({ text }: ProseProps) {
  return (
    <>
      {text.split("`").map((part, index) =>
        // oxlint-disable-next-line react/no-array-index-key -- A run's position in the sentence is its identity; the same word can appear twice.
        index % 2 === 1 ? <Code key={index}>{part}</Code> : part,
      )}
    </>
  );
}
