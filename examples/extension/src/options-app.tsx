import { Code, Masthead } from "@examples/ui";

import { AppliedTheme } from "./applied-theme";
import { AreasPanel } from "./panels/areas-panel";
import { ClearPanel } from "./panels/clear-panel";
import { CorruptPanel } from "./panels/corrupt-panel";
import { CrossContextPanel } from "./panels/cross-context-panel";
import { EventLog } from "./panels/event-log";
import { Inspector } from "./panels/inspector";
import { NoSyncHalfPanel } from "./panels/no-sync-half-panel";
import { QuotaPanel } from "./panels/quota-panel";
import { ResolverPanel } from "./panels/resolver-panel";
import { SchemaPanel } from "./panels/schema-panel";
import { ValuesPanel } from "./panels/values-panel";
import { WorkerPanel } from "./panels/worker-panel";

/** The options page: the whole playground, on the one surface in an extension wide enough to hold it. */
export function OptionsApp() {
  return (
    <div className="min-h-screen text-fg">
      <AppliedTheme />

      <Masthead
        eyebrow="@platform-storage/extension"
        title="Schema-first storage, across three extension contexts"
      >
        Everything below runs against this extension&rsquo;s real storage areas. Open the popup
        beside this page and watch the two stay in step, then look at the inspector on the right: an
        area holds <Code>values</Code>, not text, because that is what the browser transports.
      </Masthead>

      <main className="mx-auto grid max-w-7xl gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {/* The three an extension can show and neither browser example can, first. */}
          <CrossContextPanel />
          <WorkerPanel />
          <ResolverPanel />

          <SchemaPanel />
          <ValuesPanel />
          <AreasPanel />
          <NoSyncHalfPanel />
          <QuotaPanel />
          <CorruptPanel />
          <ClearPanel />
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Inspector />
          <EventLog />
        </div>
      </main>
    </div>
  );
}
