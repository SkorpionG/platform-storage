import { Badge, Card, Code, Value } from "@examples/ui";

import { local } from "../store/storage";
import { BrowserColumn } from "./browser-column";

/**
 * The same storage read on both sides of the wire, with no directive here so that the left column really is rendered on a server.
 *
 * The reads below are what force `withFallback` to choose, and on a server there is no `window`, so it takes memory and answers with the schema's declared values instead of throwing.
 */
export function ServerRenderPanel() {
  return (
    <Card
      title="The same storage, on both sides of the wire"
      description="One storage, one schema, two environments. The column on the left was rendered where no window exists; the one on the right is running in your browser, reading the same keys through the same API."
      aside={<Badge tone="info">{local.adapter.name}</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="warning">on the server</Badge>
            <span className="text-xs text-muted">memoryAdapter</span>
          </div>

          <dl className="mt-2 space-y-1.5">
            <div>
              <dt className="text-[11px] text-faint">theme</dt>
              <dd>
                <Value value={local.getSync("theme")} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-faint">recentSearches</dt>
              <dd>
                <Value value={local.getSync("recentSearches")} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-faint">user</dt>
              <dd>
                <Value value={local.getSync("user")} />
              </dd>
            </div>
          </dl>
        </div>

        <BrowserColumn />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Store something above, reload, and the two columns disagree. That disagreement is the proof:
        the library exposes no way to ask which half <Code>withFallback</Code> chose, so the values
        are what tell you. <Code>physicalKey(&quot;user&quot;)</Code> answers{" "}
        <Code>{local.physicalKey("user")}</Code> on the server as readily as in the browser, because
        it only reads the schema and never reaches for a backend at all.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-soft">
        Nothing here writes while rendering, which is what keeps one process-wide memory backend
        from leaking one request&rsquo;s values into another&rsquo;s. An application that does write
        during a render needs a storage built per request, not one built while a module loads.
      </p>
    </Card>
  );
}
