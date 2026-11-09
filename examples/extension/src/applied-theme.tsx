import { useAppliedTheme } from "./hooks/use-theme";

/**
 * Drives the page theme from the stored `theme` key, rendering nothing.
 *
 * A component rather than a bare hook, so a change of theme re-renders this and not the shell that mounts it.
 */
export function AppliedTheme() {
  useAppliedTheme();

  return null;
}
