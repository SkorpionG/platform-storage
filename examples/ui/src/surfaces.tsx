import type { ReactNode } from "react";

import { cn } from "./cn";

export interface CardProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

export function Card({ title, description, aside, children, className }: CardProps) {
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
          {description === undefined ? null : (
            <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {aside}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
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

export function Divider() {
  return <hr className="border-line" />;
}
