import { Badge, Button, Card, Code, Value } from "@examples/ui";
import { useState } from "react";

import { local } from "../storage";

export function SyncPanel() {
  // Read at render, with no await and no loading state, because web storage answers immediately.
  const immediate = local.getSync("theme");
  const [awaited, setAwaited] = useState<string | undefined>();

  return (
    <Card
      title="A synchronous half, where the platform allows one"
      description="Every storage exposes the asynchronous API. A storage over a backend that answers immediately exposes getSync and its siblings as well, and the type reflects it — an extension or AsyncStorage storage simply has no such methods to call."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="success">getSync</Badge>
            <span className="text-xs text-muted">read during render</span>
          </div>
          <p className="mt-2 text-xs text-soft">
            No promise, no effect, no first paint showing a placeholder.
          </p>
          <div className="mt-2">
            <Value value={immediate} />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="info">get</Badge>
            <span className="text-xs text-muted">awaited</span>
          </div>
          <p className="mt-2 text-xs text-soft">
            The same value, one microtask later. Identical code works on every platform.
          </p>
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

      <p className="mt-3 text-xs leading-relaxed text-soft">
        The synchronous half is what makes a server-rendered first paint possible without a loading
        state. Pair <Code>localStorageAdapter()</Code> with <Code>memoryAdapter()</Code> through{" "}
        <Code>withFallback</Code> and the same code runs on a server, where no <Code>window</Code>{" "}
        exists.
      </p>
    </Card>
  );
}
