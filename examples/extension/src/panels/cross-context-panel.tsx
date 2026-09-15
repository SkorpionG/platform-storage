import { Badge, Button, Card, Code, CodeBlock, Field } from "@examples/ui";
import { useState, useSyncExternalStore } from "react";

// The bridge's own text, so what is shown can never drift from what runs. The whole module rather than an extract of it, the same way the schema panel shows the whole schema.
import bridgeSource from "../store/changes.ts?raw";
import { getObservedChange, subscribeToObservedChanges } from "../store/changes";
import { askWorker, WORKER_REQUEST } from "../store/messages";

export function CrossContextPanel() {
  const change = useSyncExternalStore(subscribeToObservedChanges, getObservedChange);
  const [asked, setAsked] = useState<string>();

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
          hint="Every write reaches this, including the ones this page made itself. The relay does not need to know who wrote."
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
          This is the whole of it. It belongs to the demo rather than to the library, because{" "}
          <Code>storage.onChanged</Code> is not wrapped yet:
        </p>
        <CodeBlock code={bridgeSource.trim()} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        <Code>notifyStorageChanged</Code> exists for exactly this, and is named for the event rather
        than for the counter behind it, so that when the library grows a real change subscription
        this file is what it replaces rather than something that has to be unpicked. Until then, a
        cross-context change is the application&rsquo;s to notice. The two web examples in this
        repository cannot even do this much: the <Code>storage</Code> event fires only in other
        tabs, never in the one that wrote.
      </p>
    </Card>
  );
}
