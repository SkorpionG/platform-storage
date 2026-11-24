import { Badge, Button, Card, Code, CodeBlock, Outcome } from "@examples/ui";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// The bridge's own text, so what is shown can never drift from what runs.
import bridgeSource from "../store/changes.ts?raw";
import { getObservedChange, subscribeToObservedChanges } from "../store/changes";
import { askWorker, WORKER_REQUEST } from "../store/messages";
import type { WorkerReport, WorkerRequest } from "../store/messages";
import { local } from "../store/storages";

/**
 * The popup, this page and the background service worker, each with its own storage over the same area.
 *
 * One card rather than two, because the worker writing and every other context following it are the same demonstration seen from either end.
 */
export function OtherContextsPanel() {
  const change = useSyncExternalStore(subscribeToObservedChanges, getObservedChange);
  const [report, setReport] = useState<WorkerReport>();
  const [unreachable, setUnreachable] = useState(false);
  const [watched, setWatched] = useState<string>();

  /* Held steady across renders so the first report can be an effect with an honest dependency list rather than an empty one. */
  const ask = useCallback((request: WorkerRequest): void => {
    void askWorker(request).then((next) => {
      setReport(next);
      setUnreachable(next === undefined);
    });
  }, []);

  useEffect(() => {
    ask(WORKER_REQUEST.Report);
  }, [ask]);

  useEffect(
    () =>
      local.watch("visitCount", ({ oldValue, newValue }) => {
        setWatched(`${String(oldValue)} → ${String(newValue)}`);
      }),
    [],
  );

  return (
    <Card
      title="Other contexts"
      lead="Ask the background worker to write, and watch this page follow a write it did not make."
      aside={
        <Badge tone={unreachable ? "danger" : "success"}>
          worker {unreachable ? "unreachable" : "answering"}
        </Badge>
      }
      how={
        <>
          <p>
            The popup, this page and the worker each build their own storage over the same area. A
            storage reports only the writes made through it, so the others learn of a change from
            the browser&rsquo;s <Code>storage.onChanged</Code>, which the hooks follow by
            themselves. An area reports every write in every context, including the one that made
            it, so each change arrives once.
          </p>
          <p>
            A Manifest V3 worker is stopped when idle and started again on the next event, running
            its modules from the top. Its storage is rebuilt each time, and works from the first
            call because the adapter looks the extension API up on every operation rather than
            capturing it once. An alarm also ticks every minute, so leaving the browser alone shows
            the same thing.
          </p>
          <p>
            The feed underneath the hooks, which this card reads because it also shows keys no
            schema declares:
          </p>
          <CodeBlock code={bridgeSource.trim()} />
        </>
      }
    >
      <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-xs text-soft">
        <li>Tick a few times.</li>
        <li>
          In <Code>chrome://extensions</Code>, press <Code>service worker</Code>, then Terminate.
        </li>
        <li>Tick again: the worker&rsquo;s own count starts over, and visitCount carries on.</li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button tone="primary" onClick={() => ask(WORKER_REQUEST.TickNow)}>
          Ask the worker to tick
        </Button>
        <Button onClick={() => ask(WORKER_REQUEST.Report)}>Report</Button>
      </div>

      <div className="mt-3 space-y-1.5">
        <Outcome label="Ticks by this worker instance">
          <Badge tone="warning">{report?.ticksThisWorker ?? "—"}</Badge>
          <span className="text-faint">
            started {report === undefined ? "—" : new Date(report.startedAt).toLocaleTimeString()}
          </span>
        </Outcome>
        <Outcome label="visitCount, as the area holds it">
          <Badge tone="success">{report?.visitCount ?? "—"}</Badge>
        </Outcome>
        <Outcome label="What storage.watch reported">
          {watched === undefined ? (
            <span className="text-faint">nothing yet</span>
          ) : (
            <Badge tone="info">{watched}</Badge>
          )}
        </Outcome>
        <Outcome label="Last change the browser reported">
          {change === undefined ? (
            <span className="text-faint">nothing yet</span>
          ) : (
            <>
              <Badge tone="info">storage.{change.area}</Badge>
              <Badge>{change.physicalKey}</Badge>
              {change.key === undefined ? (
                <span className="text-faint">not in the schema</span>
              ) : null}
              <span className="text-faint">{new Date(change.at).toLocaleTimeString()}</span>
            </>
          )}
        </Outcome>
      </div>
    </Card>
  );
}
