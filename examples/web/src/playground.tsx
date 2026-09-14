import type { ReactNode } from "react";

import { AppliedTheme } from "./applied-theme";
import { CommonPanels } from "./common-panels";
import { Masthead } from "./masthead";
import { SidePanels } from "./side-panels";

export interface PlaygroundProps {
  /** The package being demonstrated, above the title. */
  readonly eyebrow: string;
  readonly title: string;
  /** What this app adds that the others cannot, which is the only copy that differs between them. */
  readonly intro: ReactNode;
  /** The schema module's own text. Each app reads it the way its own build can. */
  readonly schemaSource: string;
  /** Panels only this platform can show, mounted above the shared ones. */
  readonly leading?: ReactNode | undefined;
}

/** The whole page, so an app is a choice of copy and whichever panels its own platform makes visible. */
export function Playground({ eyebrow, title, intro, schemaSource, leading }: PlaygroundProps) {
  return (
    <div className="min-h-screen text-fg">
      <AppliedTheme />

      <Masthead eyebrow={eyebrow} title={title}>
        {intro}
      </Masthead>

      <main className="mx-auto grid max-w-7xl gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {leading}
          <CommonPanels schemaSource={schemaSource} />
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SidePanels />
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
