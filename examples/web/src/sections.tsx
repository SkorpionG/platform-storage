import type { TabDefinition } from "@examples/ui";
import type { ReactNode } from "react";

import { ClearPanel } from "./panels/clear-panel";
import { CorruptPanel } from "./panels/corrupt-panel";
import { CrossTabPanel } from "./panels/cross-tab-panel";
import { MigrationPanel } from "./panels/migration-panel";
import { PrefixPanel } from "./panels/prefix-panel";
import { QuotaPanel } from "./panels/quota-panel";
import { SchemaPanel } from "./panels/schema-panel";
import { SessionPanel } from "./panels/session-panel";
import { SummaryPanel } from "./panels/summary-panel";
import { SyncPanel } from "./panels/sync-panel";
import { TourPanel } from "./panels/tour-panel";
import { UnavailablePanel } from "./panels/unavailable-panel";
import { ValuesPanel } from "./panels/values-panel";
import { SECTION, SECTION_LABEL } from "./section";
import type { SectionId } from "./section";

/** A tab only one app's platform can show, named by its id so its label is the one every link to it uses. */
export interface PlatformTab {
  readonly id: SectionId;
  readonly content: ReactNode;
}

function tab(id: SectionId, content: ReactNode): TabDefinition {
  return { id, label: SECTION_LABEL[id], content };
}

export interface SectionsOptions {
  /** Handed to the schema panel, which is the only one an app has to supply anything for. */
  readonly schemaSource: string;
  /** A tab only this app's platform can show, placed before the schema. */
  readonly platformTab?: PlatformTab | undefined;
}

/**
 * The page's tabs, each a group of cards about one thing.
 *
 * Each tab is named through `SECTION`, since its id is also the URL hash that opens it.
 */
export function sections({
  schemaSource,
  platformTab,
}: SectionsOptions): ReadonlyArray<TabDefinition> {
  return [
    tab(SECTION.Tour, <TourPanel />),
    tab(
      SECTION.Values,
      <>
        <ValuesPanel />
        <SummaryPanel />
        <SyncPanel />
      </>,
    ),
    tab(
      SECTION.BadData,
      <>
        <CorruptPanel />
        <MigrationPanel />
        <QuotaPanel />
        <UnavailablePanel />
      </>,
    ),
    tab(
      SECTION.Storages,
      <>
        <PrefixPanel />
        <SessionPanel />
        <CrossTabPanel />
        <ClearPanel />
      </>,
    ),
    ...(platformTab === undefined ? [] : [tab(platformTab.id, platformTab.content)]),
    tab(SECTION.Schema, <SchemaPanel source={schemaSource} />),
  ];
}
