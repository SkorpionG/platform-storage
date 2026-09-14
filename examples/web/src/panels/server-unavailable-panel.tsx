import { Badge, Card, Code } from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/web";

import { unguardedLocal } from "../store/storage";
import { BrowserUnavailableProbe } from "./browser-unavailable-probe";

/*
  A plain object rather than the error itself. React's serialization replaces an `Error` crossing out of a Server Component with one of its own, and the subclass, the `code` and the brand do not survive the trip, so what is wanted is read here while the error is still itself.
*/
interface Reported {
  readonly name: string;
  readonly code: string;
  readonly message: string;
  readonly cause: string;
}

function probe(): Reported | undefined {
  try {
    unguardedLocal.getSync("theme");
    return undefined;
  } catch (error) {
    /* A guard clause rather than a rethrow: throwing here would fail the render, which is the exact failure this panel exists to say does not happen. */
    if (!isPlatformStorageError(error)) return undefined;

    return {
      name: error.name,
      code: error.code,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.name : "none",
    };
  }
}

const reported = probe();

/** Rendered on a server, where `localStorage` paired with nothing has to report rather than crash. */
export function ServerUnavailablePanel() {
  return (
    <Card
      title="A missing backend is reported, not a crash"
      description="This storage is localStorage with nothing behind it. On a server that is a backend which does not exist, and the render still has to finish."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="warning">on the server</Badge>
            <span className="text-xs text-muted">createLocalStorage, no fallback</span>
          </div>

          {reported === undefined ? (
            <p className="mt-2 text-xs text-soft">
              The read succeeded, which on a server it should not have. Something is providing a{" "}
              <Code>window</Code> here.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="danger">{reported.name}</Badge>
                <Badge>{reported.code}</Badge>
                <span className="text-[11px] text-faint">cause: {reported.cause}</span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted">
                {reported.message}
              </p>
            </>
          )}
        </div>

        <BrowserUnavailableProbe />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        The page you are reading rendered anyway. A typed error is something an application can
        answer for; a <Code>ReferenceError</Code> thrown out of a render is not, and the adapter
        reaching for its backend inside a guard on every operation is what turns the one into the
        other.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        The error is flattened to a plain object before it leaves the server. React substitutes its
        own error for yours on the way across, so the subclass, the <Code>code</Code> and the brand
        are gone by the time a client component could read them.
      </p>
    </Card>
  );
}
