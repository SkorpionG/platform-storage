import { useEffect } from "react";

import { startChangeBridge } from "../store/changes";

/** Relays the browser's change feed into the hooks for as long as this page is open. One per page, mounted by the shell. */
export function useChangeBridge(): void {
  useEffect(() => startChangeBridge(), []);
}
