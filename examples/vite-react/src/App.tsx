import { Code } from "@examples/ui";

import { ClearPanel } from "./panels/clear-panel";
import { CorruptPanel } from "./panels/corrupt-panel";
import { EventLog } from "./panels/event-log";
import { Inspector } from "./panels/inspector";
import { SchemaPanel } from "./panels/schema-panel";
import { SessionPanel } from "./panels/session-panel";
import { SyncPanel } from "./panels/sync-panel";
import { UnavailablePanel } from "./panels/unavailable-panel";
import { ValuesPanel } from "./panels/values-panel";
import { useAppliedTheme } from "./use-theme";

export function App() {
  useAppliedTheme();

  return (
    <div className="min-h-screen text-fg">
      <header className="border-b border-line bg-inset">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <p className="font-mono text-xs text-sky-600 dark:text-sky-400">@platform-storage/web</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
            Schema-first storage, in a real browser
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Everything below runs against the actual <Code>localStorage</Code> of this page. Open
            devtools and watch the two panels on the right: the inspector shows the raw text on the
            origin, and the log shows every failure the library handled on your behalf.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <SchemaPanel />
          <ValuesPanel />
          <CorruptPanel />
          <SyncPanel />
          <ClearPanel />
          <UnavailablePanel />
          <SessionPanel />
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Inspector />
          <EventLog />
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-10 pt-2">
        <p className="text-xs leading-relaxed text-faint">
          The page re-reads every value after each action, because change subscription is not part
          of the library yet. It is on the roadmap; until it lands, an app either re-reads or keeps
          its own state, which is what this demo does.
        </p>
      </footer>
    </div>
  );
}
