import { Screen } from "../components/screen";
import { EventLog } from "../panels/event-log";
import { NativeModulePanel } from "../panels/native-module-panel";
import { RestartPanel } from "../panels/restart-panel";
import { StoredKeysPanel } from "../panels/stored-keys-panel";

export function Inspector() {
  return (
    <Screen
      title="Inspector"
      intro="What the adapter calls itself, what survived the last launch, what the device is actually holding, and everything that failed along the way."
    >
      <NativeModulePanel />
      <RestartPanel />
      <StoredKeysPanel />
      <EventLog />
    </Screen>
  );
}
