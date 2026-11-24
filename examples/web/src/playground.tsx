import { Masthead, Tabs } from "@examples/ui";
import type { ReactNode } from "react";

import { AppliedTheme } from "./applied-theme";
import { SECTION } from "./section";
import type { SectionId } from "./section";
import { sections } from "./sections";
import type { PlatformTab } from "./sections";
import { SidePanels } from "./side-panels";

export interface PlaygroundProps {
  /** The package being demonstrated, above the title. */
  readonly eyebrow: string;
  readonly title: string;
  /** What this app adds that the others cannot, in a sentence or two. */
  readonly intro: ReactNode;
  /** The schema module's own text. Each app reads it the way its own build can. */
  readonly schemaSource: string;
  /** A tab only this platform can show, placed before the schema. */
  readonly platformTab?: PlatformTab | undefined;
  /** The tab open when the URL names none. Defaults to the tour. */
  readonly defaultTab?: SectionId | undefined;
}

/** The whole page, so an app is a choice of copy and whichever tab its own platform makes visible. */
export function Playground({
  eyebrow,
  title,
  intro,
  schemaSource,
  platformTab,
  defaultTab = SECTION.Tour,
}: PlaygroundProps) {
  return (
    <div className="min-h-screen text-fg">
      <AppliedTheme />

      <Masthead eyebrow={eyebrow} title={title}>
        {intro}
      </Masthead>

      <main className="mx-auto grid max-w-7xl gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Tabs
          label="Sections"
          defaultId={defaultTab}
          tabs={sections({ schemaSource, platformTab })}
        />

        {/* Beside every tab, so whatever a card does is visible on the origin and in the log without leaving it. Scrolls on its own once the log outgrows the window, since a pinned column taller than the window would hide its end. */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <SidePanels />
        </div>
      </main>
    </div>
  );
}
