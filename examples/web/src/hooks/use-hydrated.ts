"use client";

import { useSyncExternalStore } from "react";

/* Nothing ever changes after hydration, so the subscription is a formality. At module scope because `useSyncExternalStore` resubscribes whenever the identity of this function changes. */
const subscribe = (): (() => void) => () => {};

const hydrated = (): boolean => true;
const notYet = (): boolean => false;

/** Whether React has taken over the server's markup. The same two-snapshot mechanism `useStoredValue` runs on, reduced to one boolean. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, hydrated, notYet);
}
