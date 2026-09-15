import { Badge, Button, Card, Code, Field } from "@examples/ui";
import { useCallback, useEffect, useState } from "react";

import { askWorker, WORKER_REQUEST } from "../store/messages";
import type { WorkerReport, WorkerRequest } from "../store/messages";

export function WorkerPanel() {
  const [report, setReport] = useState<WorkerReport>();
  const [unreachable, setUnreachable] = useState(false);

  /* Held steady across renders so the first report can be an effect with an honest dependency list rather than an empty one. */
  const refresh = useCallback((request: WorkerRequest): void => {
    void askWorker(request).then((next) => {
      setReport(next);
      setUnreachable(next === undefined);
    });
  }, []);

  useEffect(() => {
    refresh(WORKER_REQUEST.Report);
  }, [refresh]);

  return (
    <Card
      title="A storage built in a service worker that keeps being torn down"
      description="A Manifest V3 worker is stopped whenever it goes idle and started again on the next event, running its modules from the top each time. The storage is built while that module loads, long before anything reads from it."
      aside={
        <Badge tone={unreachable ? "danger" : "success"}>
          {unreachable ? "unreachable" : "answering"}
        </Badge>
      }
    >
      <div className="divide-y divide-line">
        <Field
          label="Ticks written by this worker instance"
          hint="A counter in the worker's own module scope. A respawn starts it again at zero, because module scope does not survive."
        >
          <Badge tone="warning">{report?.ticksThisWorker ?? "—"}</Badge>
        </Field>

        <Field
          label="visitCount, as the area holds it"
          hint="Written through the schema by the same worker. Nothing about a respawn touches it."
        >
          <Badge tone="success">{report?.visitCount ?? "—"}</Badge>
        </Field>

        <Field
          label="This worker started"
          hint="Also module scope, so it moves whenever the worker was restarted."
        >
          <span className="font-mono text-[11px] text-muted">
            {report === undefined ? "—" : new Date(report.startedAt).toLocaleTimeString()}
          </span>
        </Field>

        <Field
          label="Drive it"
          hint="Ticking writes one value; reporting only reads. Either one wakes a stopped worker."
        >
          <Button tone="primary" onClick={() => refresh(WORKER_REQUEST.TickNow)}>
            Tick now
          </Button>
          <Button onClick={() => refresh(WORKER_REQUEST.Report)}>Report</Button>
        </Field>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        To see the point of this panel: tick a few times, note both numbers, then open{" "}
        <Code>chrome://extensions</Code>, find this extension and press <Code>service worker</Code>{" "}
        &rarr; terminate. Come back and press Report. The count of ticks is back to zero and the
        visit count is exactly where you left it — the worker died, the storage it had built died
        with it, and a new one resolved the same area on its first operation.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        This is why the adapter looks the extension API up on every call rather than capturing it
        once. There is also an alarm running every minute, so leaving the browser alone for a while
        and coming back shows the same thing without terminating anything by hand.
      </p>
    </Card>
  );
}
