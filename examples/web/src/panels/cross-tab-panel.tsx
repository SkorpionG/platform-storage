"use client";

import { Badge, Button, Card, Code, Outcome, Value } from "@examples/ui";
import { useStorageValue } from "@platform-storage/react";
import { useEffect, useState } from "react";

import { local } from "../store/storage";

interface Heard {
  /** `null` is what the browser reports for a `clear()`, which names no key. */
  readonly key: string | null;
  readonly at: number;
}

export function CrossTabPanel() {
  const [visits, writer] = useStorageValue(local, "visitCount");
  const [heard, setHeard] = useState<Heard | undefined>();

  /* The browser's own event, listened to only so this card can say a change came from elsewhere. The value above follows it without any of this. */
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.storageArea !== window.localStorage) return;
      setHeard({ key: event.key, at: Date.now() });
    };

    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <Card
      title="Other tabs"
      lead="Open a second tab, press Add a visit there, and watch this one follow."
      how={
        <>
          <p>
            The browser fires a <Code>storage</Code> event in every other tab on the origin, and the
            hooks follow it by themselves. It never fires in the tab that made the write, so the
            library announces a tab&rsquo;s own writes to that tab itself.
          </p>
          <p>
            Every hook on the page moves together, including the ones on other tabs of this page.
          </p>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          onClick={() => {
            window.open(`${window.location.pathname}${window.location.search}#storages`, "_blank");
          }}
        >
          Open a second tab
        </Button>
        <Button onClick={() => writer.update((count) => count + 1)}>Add a visit</Button>
      </div>

      <div className="mt-3 space-y-1.5">
        <Outcome label="visitCount, as this tab reads it">
          <output aria-label="Visits seen by this tab">
            <Value value={visits} />
          </output>
        </Outcome>
        <Outcome label="Last change from another tab">
          {heard === undefined ? (
            <span className="text-faint">nothing yet</span>
          ) : (
            <>
              <Badge tone="info">{heard.key ?? "clear()"}</Badge>
              <span className="text-faint">{new Date(heard.at).toLocaleTimeString()}</span>
            </>
          )}
        </Outcome>
      </div>
    </Card>
  );
}
