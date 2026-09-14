import type { ReactNode } from "react";

export interface MastheadProps {
  /** The package being demonstrated, set in monospace above the title. */
  readonly eyebrow: string;
  readonly title: string;
  /** What this particular app adds to the demonstration, which is the one thing that differs between them. */
  readonly children: ReactNode;
}

export function Masthead({ eyebrow, title, children }: MastheadProps) {
  return (
    <header className="border-b border-line bg-inset">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="font-mono text-xs text-sky-600 dark:text-sky-400">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </header>
  );
}
