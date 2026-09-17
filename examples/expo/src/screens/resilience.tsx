import { Screen } from "../components/screen";
import { ClearPanel } from "../panels/clear-panel";
import { CorruptPanel } from "../panels/corrupt-panel";
import { FailurePanel } from "../panels/failure-panel";
import { NoSyncHalfPanel } from "../panels/no-sync-half-panel";

export function Resilience() {
  return (
    <Screen
      title="Resilience"
      intro="What happens to a read when the stored data no longer matches the schema, and to a write when the device refuses it."
    >
      <CorruptPanel />
      <ClearPanel />
      <FailurePanel />
      <NoSyncHalfPanel />
    </Screen>
  );
}
