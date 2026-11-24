import type { ReactNode } from "react";

import { cn } from "./cn";

export interface CardProps {
  readonly title: string;
  /** One line saying what to do with the card, in the imperative. */
  readonly lead?: ReactNode;
  /** How the card's behavior comes about, closed by default so the card shows its controls first. */
  readonly how?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

export function Card({ title, lead, how, aside, children, className }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-surface shadow-sm shadow-black/5 dark:shadow-lg dark:shadow-black/20",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
          {lead === undefined ? null : (
            <p className="mt-1 text-sm leading-relaxed text-muted">{lead}</p>
          )}
        </div>
        {aside}
      </header>
      <div className="px-5 py-4">{children}</div>
      {how === undefined ? null : (
        <Disclosure summary="How it works" className="border-t border-line px-5 py-3">
          <div className="space-y-2 text-xs leading-relaxed text-soft">{how}</div>
        </Disclosure>
      )}
    </section>
  );
}

export interface DisclosureProps {
  /** The one line shown while it is closed. */
  readonly summary: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/**
 * Content closed behind a one-line summary.
 *
 * A native `<details>` rather than a component with state, so it renders on a server and opens with JavaScript off.
 */
export function Disclosure({ summary, children, className }: DisclosureProps) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export interface AlertProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Something that went wrong, said in a sentence rather than as a code in a badge. Announced as it appears. */
export function Alert({ children, className }: AlertProps) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300",
        className,
      )}
    >
      {children}
    </p>
  );
}

export interface OutcomeProps {
  readonly label: ReactNode;
  readonly children: ReactNode;
}

/** One result inside a card: what was checked, then what came back. */
export function Outcome({ label, children }: OutcomeProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-soft">{label}</span>
      {children}
    </div>
  );
}

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-raised text-body",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly title?: string | undefined;
}

export function Badge({ tone = "neutral", children, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-4",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export interface FieldProps {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}

/** One labeled row. The hint sits under the control, which is where the read type and the note go. */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {hint === undefined ? null : <div className="mt-1.5 text-xs text-soft">{hint}</div>}
    </div>
  );
}

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
