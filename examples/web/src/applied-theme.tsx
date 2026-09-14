"use client";

import { useAppliedTheme } from "./hooks/use-theme";

/**
 * Drives the page theme from the stored `theme` key, rendering nothing.
 *
 * A component rather than a bare hook, because the shell that mounts it may be a Server Component and so cannot call one itself.
 */
export function AppliedTheme() {
  useAppliedTheme();

  return null;
}
