import { Badge, Button, Card, Code, CodeBlock, Field } from "@examples/ui";
import { useEffect, useState, useSyncExternalStore } from "react";

// The bridge's own text, so what is shown can never drift from what runs. The whole module rather than an extract of it, the same way the schema panel shows the whole schema.
import bridgeSource from "../store/changes.ts?raw";
import { getObservedChange, subscribeToObservedChanges } from "../store/changes";
import { askWorker, WORKER_REQUEST } from "../store/messages";
import { local } from "../store/storages";

export function CrossContextPanel() {
  const change = useSyncExternalStore(subscribeToObservedChanges, getObservedChange);
  const [asked, setAsked] = useState<string>();
  const [watched, setWatched] = useState<string>();

  useEffect(
    () =>
      local.watch("visitCount", ({ oldValue, newValue }) => {
        setWatched(`${String(oldValue)} → ${String(newValue)}`);
      }),
    [],
  );

  return (
    <Card
      title="A change made somewhere else"
      description="The popup, this page and the background service worker each hold their own storage over the same area. A write in one is invisible to the others until something says so, because a storage reports only the writes made through it."
      aside={
        <Badge tone={change === undefined ? "neutral" : "success"}>
          {change === undefined ? "nothing yet" : "live"}
        </Badge>
      }
    >
      <div className="divide-y divide-line">
        <Field
          label="Last change the browser reported"
          hint="Every write reaches this, including the ones this page made itself."
        >
          {change === undefined ? (
            <span className="text-xs text-faint">nothing yet</span>
          ) : (
            <>
              <Badge tone="info">storage.{change.area}</Badge>
              <Badge>{change.physicalKey}</Badge>
              {change.key === undefined ? (
                <span className="text-[11px] text-faint">not in the schema</span>
              ) : (
                <Code>{change.key}</Code>
              )}
              <span className="text-[11px] text-faint">
                {new Date(change.at).toLocaleTimeString()}
              </span>
            </>
          )}
        </Field>

        <Field
          label="What storage.watch reported"
          hint="The visit count before and after, read through the schema, wherever the write was made."
        >
          {watched === undefined ? (
            <span className="text-xs text-faint">nothing yet</span>
          ) : (
            <Badge tone="info">{watched}</Badge>
          )}
        </Field>

        <Field
          label="Make the service worker write"
          hint="Nothing on this page touches storage. The worker increments the visit count, the browser reports it, and every panel reading that key moves."
        >
          <Button
            tone="primary"
            onClick={() =>
              void askWorker(WORKER_REQUEST.TickNow).then((report) => {
                setAsked(report === undefined ? "no answer" : `visitCount ${report.visitCount}`);
              })
            }
          >
            Ask the worker to tick
          </Button>
          {asked === undefined ? null : <Badge tone="success">{asked}</Badge>}
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs leading-relaxed text-soft">
          The hooks on this page follow <Code>storage.onChanged</Code> by themselves. This panel
          reads the adapter&rsquo;s feed underneath them, because it also shows keys no schema
          declares:
        </p>
        <CodeBlock code={bridgeSource.trim()} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        An area reports every write in every context, including the one that made it, so each is
        delivered once. The <Code>storage</Code> event on the web fires only in other tabs, so there
        the library announces a tab&rsquo;s own writes itself.
      </p>
    </Card>
  );
}
