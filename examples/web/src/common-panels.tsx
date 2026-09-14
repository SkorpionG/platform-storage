import { ClearPanel } from "./panels/clear-panel";
import { CorruptPanel } from "./panels/corrupt-panel";
import { SchemaPanel } from "./panels/schema-panel";
import { SessionPanel } from "./panels/session-panel";
import { SyncPanel } from "./panels/sync-panel";
import { UnavailablePanel } from "./panels/unavailable-panel";
import { ValuesPanel } from "./panels/values-panel";

export interface CommonPanelsProps {
  /** Handed to the schema panel, which is the only one an app has to supply anything for. */
  readonly schemaSource: string;
}

/** Everything the library does that is the same wherever it runs. An app mounts this and adds whatever its own platform makes visible. */
export function CommonPanels({ schemaSource }: CommonPanelsProps) {
  return (
    <>
      <SchemaPanel source={schemaSource} />
      <ValuesPanel />
      <CorruptPanel />
      <SyncPanel />
      <ClearPanel />
      <UnavailablePanel />
      <SessionPanel />
    </>
  );
}
