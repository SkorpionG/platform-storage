"use client";

import { Badge, Button, Card, Code, Value } from "@examples/ui";
import { useState } from "react";

import { useStorageValue } from "@platform-storage/react";

import { local } from "../store/storage";

export function SyncPanel() {
  /*
    Read at render, with no await and no loading state, because web storage answers immediately. Through the hook rather than calling `getSync` here, because a render on a server has to have an answer too, and one taken straight off the storage would disagree with the browser's.
  */
  const [immediate] = useStorageValue(local, "theme");
  const [awaited, setAwaited] = useState<string | undefined>();

  return (
    <Card
      title="Read now, or await it"
      lead="The left value was read during render. Press Await it for the same read through a promise."
      how={
        <>
          <p>
            Every storage has the asynchronous API. One over a backend that answers immediately also
            has <Code>getSync</Code> and its siblings, and the type says so: an extension or
            AsyncStorage storage simply has no such methods to call.
          </p>
          <p>
            The synchronous half is what makes a first paint possible without a loading state. Give{" "}
            <Code>createLocalStorage</Code> a <Code>fallback</Code> and the same code runs on a
            server, where no <Code>window</Code> exists.
          </p>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="success">getSync</Badge>
            <span className="text-xs text-muted">read during render</span>
          </div>
          <div className="mt-2">
            <Value value={immediate} />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="info">get</Badge>
            <span className="text-xs text-muted">awaited</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={() => {
                void local.get("theme").then(setAwaited);
              }}
            >
              Await it
            </Button>
            {awaited === undefined ? (
              <span className="text-xs text-faint">not read yet</span>
            ) : (
              <Value value={awaited} />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
