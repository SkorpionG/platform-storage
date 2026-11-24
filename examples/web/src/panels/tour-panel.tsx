"use client";

import { runTour, TOUR_CHECK, TOUR_CHECKS } from "@examples/schema";
import type { TourBackend, TourCheckId, TourResult } from "@examples/schema";
import { Alert, Badge, Button, Card, Code, TourChecklist } from "@examples/ui";
import { notifyStorageChanged } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";
import { useState } from "react";

import { SECTION, SECTION_LABEL } from "../section";
import type { SectionId } from "../section";
import { failuresSoFar, tour } from "../store/storage";

/** Which tab shows each behavior in full, so a row can send you there. */
const SHOWN_ON: { readonly [Id in TourCheckId]: SectionId } = {
  [TOUR_CHECK.Default]: SECTION.Values,
  [TOUR_CHECK.Refused]: SECTION.Values,
  [TOUR_CHECK.Fallback]: SECTION.BadData,
  [TOUR_CHECK.Logged]: SECTION.BadData,
  [TOUR_CHECK.Throw]: SECTION.BadData,
  [TOUR_CHECK.Clear]: SECTION.Storages,
  [TOUR_CHECK.Physical]: SECTION.Schema,
};

/* Through the adapter rather than `window`, so a backend that is not there plants nothing rather than throwing. */
const backend: TourBackend = {
  plant(name: string, value: unknown): void {
    const { adapter } = tour;
    if (isSyncStorageAdapter(adapter)) adapter.setSync(name, JSON.stringify(value));
  },
  holds(name: string): boolean {
    const { adapter } = tour;
    return isSyncStorageAdapter(adapter) && adapter.getSync(name) !== undefined;
  },
  remove(name: string): void {
    const { adapter } = tour;
    if (isSyncStorageAdapter(adapter)) adapter.removeSync(name);
  },
  failures: failuresSoFar,
};

type Run =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | {
      readonly status: "done";
      readonly results: ReadonlyMap<TourCheckId, TourResult>;
      /** What went wrong around the checks, which the rows cannot show. */
      readonly problem: string | undefined;
    };

export function TourPanel() {
  const [run, setRun] = useState<Run>({ status: "idle" });
  const results = run.status === "done" ? run.results : undefined;
  const passed = results === undefined ? 0 : [...results.values()].filter((r) => r.ok).length;

  const start = (): void => {
    setRun({ status: "running" });

    void runTour(tour, backend)
      .then((outcome) => {
        /* The tour writes past the library and clears past the schema, so the inspector is told once it is done. */
        notifyStorageChanged(tour);
        setRun({
          status: "done",
          results: new Map(outcome.results.map((result) => [result.id, result])),
          problem: outcome.problem,
        });
      })
      /* `runTour` reports a backend's refusal itself; this catches anything else, so the button never stays on "Running…". */
      .catch((error: unknown) => {
        setRun({
          status: "done",
          results: new Map(),
          problem: error instanceof Error ? error.message : String(error),
        });
      });
  };

  return (
    <Card
      title="Quick tour"
      lead="Run every check against this page's real localStorage, then follow a row to see it in full."
      aside={
        results === undefined ? null : (
          <output aria-label="Tour result">
            <Badge tone={passed === TOUR_CHECKS.length ? "success" : "danger"}>
              {passed} / {TOUR_CHECKS.length} passed
            </Badge>
          </output>
        )
      }
      how={
        <>
          <p>
            The checks run through a storage of their own, under the <Code>tour:</Code> prefix, and
            clear it when they finish, so nothing another tab shows is touched. The failures they
            provoke on purpose are real, and land in the Error log beside this page.
          </p>
          <p>
            Two claims cannot be run, because the compiler makes them before the page exists:
            autocomplete on every key, and{" "}
            <Code>set(&quot;theme&quot;, &quot;solarized&quot;)</Code> refused while you type. Try
            either in <Code>examples/schema</Code>.
          </p>
        </>
      }
    >
      <div className="mb-3">
        <Button tone="primary" onClick={start} disabled={run.status === "running"}>
          {run.status === "running"
            ? "Running…"
            : results === undefined
              ? "Run all checks"
              : "Run again"}
        </Button>
      </div>

      {run.status === "done" && run.problem !== undefined ? (
        <Alert className="mb-3">{run.problem}</Alert>
      ) : null}

      <TourChecklist
        rows={TOUR_CHECKS.map((check) => ({
          id: check.id,
          label: check.label,
          result: results?.get(check.id),
          href: `#${SHOWN_ON[check.id]}`,
          destination: SECTION_LABEL[SHOWN_ON[check.id]],
        }))}
      />
    </Card>
  );
}
