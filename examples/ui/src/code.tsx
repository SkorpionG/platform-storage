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

export interface CodeBlockProps {
  readonly code: string;
  readonly className?: string | undefined;
}

export function CodeBlock({ code, className }: CodeBlockProps) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border border-line bg-inset p-3 font-mono text-[11px] leading-relaxed text-body",
        className,
      )}
    >
      {code}
    </pre>
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
