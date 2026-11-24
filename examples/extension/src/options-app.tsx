import { Code, Masthead, Tabs } from "@examples/ui";
import type { TabDefinition } from "@examples/ui";
import type { ReactNode } from "react";

import { AppliedTheme } from "./applied-theme";
import { AreasPanel } from "./panels/areas-panel";
import { BatchPanel } from "./panels/batch-panel";
import { ClearPanel } from "./panels/clear-panel";
import { CorruptPanel } from "./panels/corrupt-panel";
import { EventLog } from "./panels/event-log";
import { Inspector } from "./panels/inspector";
import { MigrationPanel } from "./panels/migration-panel";
import { OtherContextsPanel } from "./panels/other-contexts-panel";
import { QuotaPanel } from "./panels/quota-panel";
import { ResolverPanel } from "./panels/resolver-panel";
import { SchemaPanel } from "./panels/schema-panel";
import { TourPanel } from "./panels/tour-panel";
import { ValuesPanel } from "./panels/values-panel";
import { SECTION, SECTION_LABEL } from "./section";
import type { SectionId } from "./section";

function tab(id: SectionId, content: ReactNode): TabDefinition {
  return { id, label: SECTION_LABEL[id], content };
}

const SECTIONS: ReadonlyArray<TabDefinition> = [
  tab(SECTION.Tour, <TourPanel />),
  tab(
    SECTION.Values,
    <>
      <ValuesPanel />
      <BatchPanel />
    </>,
  ),
  tab(
    SECTION.BadData,
    <>
      <CorruptPanel />
      <MigrationPanel />
      <QuotaPanel />
    </>,
  ),
  tab(
    SECTION.Areas,
    <>
      <AreasPanel />
      <ClearPanel />
    </>,
  ),
  tab(
    SECTION.Contexts,
    <>
      <OtherContextsPanel />
      <ResolverPanel />
    </>,
  ),
  tab(SECTION.Schema, <SchemaPanel />),
];

/** The options page: the whole playground, on the one surface in an extension wide enough to hold it. */
export function OptionsApp() {
  return (
    <div className="min-h-screen text-fg">
      <AppliedTheme />

      <Masthead
        eyebrow="@platform-storage/webextension"
        title="Schema-first storage, across three extension contexts"
      >
        Every tab runs against this extension&rsquo;s real storage areas. Start with the tour, and
        open the popup beside this page to watch the two stay in step. An area holds{" "}
        <Code>values</Code>, not text.
      </Masthead>

      <main className="mx-auto grid max-w-7xl gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Tabs label="Sections" defaultId={SECTION.Tour} tabs={SECTIONS} />

        {/* Beside every tab, so whatever a card does is visible in the area and in the log without leaving it. Scrolls on its own once the log outgrows the window, since a pinned column taller than the window would hide its end. */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <Inspector />
          <EventLog />
        </div>
      </main>
    </div>
  );
}
