import { EventLog } from "./panels/event-log";
import { Inspector } from "./panels/inspector";

/** The two observers: what the origin actually holds, and every failure the library handled getting there. */
export function SidePanels() {
  return (
    <>
      <Inspector />
      <EventLog />
    </>
  );
}
