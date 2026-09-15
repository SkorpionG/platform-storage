import { useAppliedTheme } from "./hooks/use-theme";
import { useChangeBridge } from "./hooks/use-change-bridge";

/**
 * Drives the page theme from the stored `theme` key and relays the browser's change feed, rendering nothing.
 *
 * A component rather than two bare hooks, so a shell mounts one thing and every page gets both.
 */
export function AppliedTheme() {
  useChangeBridge();
  useAppliedTheme();

  return null;
}
