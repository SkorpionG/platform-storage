import { Screen } from "../components/screen";
import { ClearPanel } from "../panels/clear-panel";
import { CorruptPanel } from "../panels/corrupt-panel";
import { FailurePanel } from "../panels/failure-panel";
import { MigrationPanel } from "../panels/migration-panel";

export function Resilience() {
  return (
    <Screen title="Resilience" intro="Bad data, old data, a clear, and a device that refuses.">
      <CorruptPanel />
      <MigrationPanel />
      <ClearPanel />
      <FailurePanel />
    </Screen>
  );
}
