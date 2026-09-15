"use client";

import { useSyncExternalStore } from "react";

/* Nothing ever changes after hydration, so the subscription is a formality. At module scope because `useSyncExternalStore` resubscribes whenever the identity of this function changes. */
const subscribe = (): (() => void) => () => {};

const hydrated = (): boolean => true;
const notYet = (): boolean => false;

/**
 * Whether React has taken over the server's markup.
 *
 * `false` while a server renders and through the browser's first pass, `true` from the moment hydration ends. Render something browser-only behind this and the two passes still agree, which is what keeps it out of the mismatch React would otherwise report.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, hydrated, notYet);
}
