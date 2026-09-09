import { appSchema } from "@examples/schema";
import { Badge, Button, Card, Code, Value } from "@examples/ui";
import {
  createStorage,
  isPlatformStorageError,
  memoryAdapter,
  webStorageAdapter,
  withFallback,
} from "@platform-storage/web";
import { useState } from "react";

/** Stands in for Safari private browsing, a sandboxed iframe, or a server with no `window` at all. */
function refusedStorage(): Storage {
  throw new DOMException("The operation is insecure.", "SecurityError");
}

const bare = createStorage({
  schema: appSchema,
  adapter: webStorageAdapter(refusedStorage),
});

const guarded = createStorage({
  schema: appSchema,
  adapter: withFallback(webStorageAdapter(refusedStorage), memoryAdapter()),
});

interface Attempt {
  readonly failed: boolean;
  readonly detail: string;
}

export function UnavailablePanel() {
  const [bareResult, setBareResult] = useState<Attempt | undefined>();
  const [guardedValue, setGuardedValue] = useState<string | undefined>();

  return (
    <Card
      title="A backend that is not there is reported, never fatal"
      description="Reaching for window.localStorage can throw on the property access itself, not just on write. Both storages below are built over a getter that always throws, exactly as a sandboxed iframe behaves."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-body">Web storage alone</div>
              <p className="mt-0.5 text-xs text-soft">
                The adapter resolves the backend on every operation, so the failure surfaces as a
                typed error rather than a crash while a module loads.
              </p>
            </div>
            <Button
              onClick={() => {
                try {
                  bare.getSync("theme");
                  setBareResult({ failed: false, detail: "read succeeded" });
                } catch (error) {
                  setBareResult({
                    failed: true,
                    detail: isPlatformStorageError(error)
                      ? `${error.name} · ${error.code}`
                      : "Error",
                  });
                }
              }}
            >
              Read
            </Button>
          </div>
          {bareResult === undefined ? null : (
            <div className="mt-2">
              <Badge tone={bareResult.failed ? "danger" : "success"}>{bareResult.detail}</Badge>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-body">
                <Code>withFallback(web, memory)</Code>
              </div>
              <p className="mt-0.5 text-xs text-soft">
                The same unavailable backend, paired with memory. The choice is made on first use
                and then kept, so a value is never written to one and read from the other.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                tone="primary"
                onClick={() => {
                  guarded.setSync("theme", "dark");
                  setGuardedValue(guarded.getSync("theme"));
                }}
              >
                Write and read
              </Button>
            </div>
          </div>
          {guardedValue === undefined ? null : (
            <div className="mt-2">
              <Value value={guardedValue} />
              <span className="ml-2 text-xs text-soft">
                served from memory; nothing reached the origin
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
