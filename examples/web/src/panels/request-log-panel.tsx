import { appSchema } from "@examples/schema";
import { Badge, Card, Code } from "@examples/ui";
import { createStorageErrorLog } from "@platform-storage/react/server";
import { createLocalStorage, memoryAdapter } from "@platform-storage/web";

/* A value the schema refuses, planted where this request's memory starts from, so the read below has something to report. */
const PLANTED = '"purple"';

/*
  Built during the render rather than while the module loads, so each request has a storage and a log of its own. The failures are flattened to plain strings before they leave the server, since React does not carry an error's subclass or code out of a Server Component.
*/
interface Failure {
  readonly id: number;
  readonly text: string;
}

function renderOnce(): { readonly theme: string; readonly failures: ReadonlyArray<Failure> } {
  const log = createStorageErrorLog();
  const storage = createLocalStorage({
    schema: appSchema,
    fallback: memoryAdapter({ name: "request-memory", initial: { theme: PLANTED } }),
    onError: log.record,
  });
  const theme = storage.getSync("theme");

  return {
    theme,
    failures: log.entries().map((entry) => ({
      id: entry.id,
      text: `${entry.error.code} ×${entry.count}`,
    })),
  };
}

/** Rendered on a server, where a storage built for one request reports into a log no other request shares. */
export function RequestLogPanel() {
  const { theme, failures } = renderOnce();

  return (
    <Card
      title="A log per request"
      lead="This render read a planted bad theme through a storage with its own error log."
      how={
        <>
          <p>
            The shared error log is one list for the whole process, which on a server means every
            request at once. A storage built for one request can take a log built beside it.
          </p>
          <p>
            Both are built inside the render, with <Code>onError: log.record</Code>, and{" "}
            <Code>log.entries()</Code> is read straight after the failing read. This failure never
            reaches the shared Error log beside the page.
          </p>
        </>
      }
      aside={<Badge tone="info">createStorageErrorLog</Badge>}
    >
      <div className="rounded-lg border border-line bg-inset p-3">
        <div className="flex items-center gap-2">
          <Badge tone="warning">on the server</Badge>
          <span className="text-xs text-muted">
            theme read as <Code>{theme}</Code> over a planted <Code>{PLANTED}</Code>
          </span>
        </div>

        <p className="mt-2 text-xs text-soft">
          This render recorded <output aria-label="Request failures">{failures.length}</output>{" "}
          {failures.length === 1 ? "failure" : "failures"}
          {failures.length > 0 ? ": " : "."}
          {failures.map((failure) => (
            <Badge key={failure.id} tone="danger">
              {failure.text}
            </Badge>
          ))}
        </p>
      </div>
    </Card>
  );
}
