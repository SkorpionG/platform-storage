import { Prose } from "./code";
import { Badge } from "./surfaces";

export interface TourChecklistRow {
  readonly id: string;
  /** The claim the check proves, with backticks marking code. */
  readonly label: string;
  /** Absent until the check has run. */
  readonly result?: { readonly ok: boolean; readonly detail: string } | undefined;
  /** Where the behavior is shown in full, and what to call that place. */
  readonly href: string;
  readonly destination: string;
}

export interface TourChecklistProps {
  readonly rows: ReadonlyArray<TourChecklistRow>;
}

/** The quick tour's checks as a list: each with its result once run, and a link to the section that shows it in full. Knows nothing about running them. */
export function TourChecklist({ rows }: TourChecklistProps) {
  return (
    <ol className="space-y-1.5">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-inset px-3 py-2"
        >
          <span className="w-6 text-center" aria-hidden="true">
            {row.result === undefined ? "·" : row.result.ok ? "✓" : "✗"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fg">
              <Prose text={row.label} />
            </div>
            {row.result === undefined ? null : (
              <div className="mt-0.5 font-mono text-[11px] text-soft">{row.result.detail}</div>
            )}
          </div>
          {row.result === undefined ? null : (
            <Badge tone={row.result.ok ? "success" : "danger"}>
              {row.result.ok ? "pass" : "fail"}
            </Badge>
          )}
          <a
            href={row.href}
            className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            {row.destination} →
          </a>
        </li>
      ))}
    </ol>
  );
}
