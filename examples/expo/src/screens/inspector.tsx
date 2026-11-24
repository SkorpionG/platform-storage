import { Screen } from "../components/screen";
import { AdapterPanel } from "../panels/adapter-panel";
import { EventLog } from "../panels/event-log";
import { RestartPanel } from "../panels/restart-panel";
import { StoredKeysPanel } from "../panels/stored-keys-panel";

export function Inspector() {
  return (
    <Screen
      title="Inspector"
      intro="What survived the last launch, what the device holds, what failed, and the adapter underneath."
    >
      <RestartPanel />
      <StoredKeysPanel />
      <EventLog />
      <AdapterPanel />
    </Screen>
  );
}
