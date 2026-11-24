import { Badge, Card, Code, Value } from "@examples/ui";
import { hasFallback } from "@platform-storage/web";

import { local } from "../store/storage";
import { BrowserColumn } from "./browser-column";

/**
 * The same storage read on both sides of the wire, with no directive here so that the left column really is rendered on a server.
 *
 * The reads below are what force the storage to choose, and on a server there is no `window`, so it takes memory and answers with the schema's declared values instead of throwing. Which half it chose is asked only after them, since asking never forces the decision.
 */
export function ServerRenderPanel() {
  const theme = local.getSync("theme");
  const recentSearches = local.getSync("recentSearches");
  const user = local.getSync("user");
  const chosen = hasFallback(local.adapter) ? local.adapter.chosen() : undefined;

  return (
    <Card
      title="The same storage, on both sides of the wire"
      lead="Left: rendered on a server with no window. Right: the same reads in this browser. Store something on the Values tab and reload."
      how={
        <>
          <p>
            The storage was built with <Code>fallback</Code>, and{" "}
            <Code>hasFallback(local.adapter)</Code> reaches <Code>chosen()</Code>, which answers{" "}
            <Code>&quot;fallback&quot;</Code> here and <Code>&quot;primary&quot;</Code> in your
            browser. <Code>physicalKey(&quot;user&quot;)</Code> answers{" "}
            <Code>{local.physicalKey("user")}</Code> on either side, because it reads the schema and
            never a backend.
          </p>
          <p>
            Nothing here writes while rendering, which keeps one process-wide memory backend from
            leaking one request&rsquo;s values into another&rsquo;s. An application that writes
            during a render needs a storage built per request.
          </p>
        </>
      }
      aside={<Badge tone="info">{local.adapter.name}</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center gap-2">
            <Badge tone="warning">on the server</Badge>
            <span className="text-xs text-muted">
              chose <output aria-label="Server chose">{chosen ?? "nothing yet"}</output>
            </span>
          </div>

          <dl className="mt-2 space-y-1.5">
            <div>
              <dt className="text-[11px] text-faint">theme</dt>
              <dd>
                <Value value={theme} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-faint">recentSearches</dt>
              <dd>
                <Value value={recentSearches} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-faint">user</dt>
              <dd>
                <Value value={user} />
              </dd>
            </div>
          </dl>
        </div>

        <BrowserColumn />
      </div>
    </Card>
  );
}
