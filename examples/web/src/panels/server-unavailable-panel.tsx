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
      title="A missing backend, on the server"
      lead="localStorage with no fallback, read during a server render. The page still rendered; press Read to try it here."
      how={
        <>
          <p>
            A typed error is something an application can answer for; a <Code>ReferenceError</Code>{" "}
            thrown out of a render is not. The adapter reaching for its backend inside a guard on
            every operation is what turns the one into the other.
          </p>
          <p>
            The error is flattened to a plain object before it leaves the server, because React
            substitutes its own error on the way across and the subclass, the <Code>code</Code> and
            the brand would be gone.
          </p>
        </>
      }
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
    </Card>
  );
}
