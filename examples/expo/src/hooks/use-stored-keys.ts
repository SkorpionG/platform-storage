import { subscribeToStorage } from "@platform-storage/react";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { readEverything } from "../store/raw";
import type { StoredEntry } from "../store/raw";
import { local } from "../store/storages";

const EMPTY: ReadonlyArray<StoredEntry> = Object.freeze([]);

/**
 * Everything the device holds, including keys this schema never declared.
 *
 * No key-shaped hook can serve this, because its subject is the keys the schema does not know about. `subscribeToStorage` is the library's own answer to that and says so, so what is left here is the enumeration, which the adapter contract deliberately does not offer, and the decision about when to re-read.
 *
 * Two things move the store and only one of them announces itself. A write through the library does; a write made straight past it, which is what planting a corruption is, does not. Re-reading whenever the tab regains focus is what catches the second, since the tab that plants is not this one.
 */
export function useStoredKeys(): ReadonlyArray<StoredEntry> {
  const [entries, setEntries] = useState<ReadonlyArray<StoredEntry>>(EMPTY);
  /* Focus and a change can land together, and two reads in flight may settle in either order. Whichever was asked for last is the one worth showing. */
  const latest = useRef(0);

  const refresh = useCallback(() => {
    const ticket = (latest.current += 1);

    void readEverything().then((next) => {
      if (latest.current === ticket) setEntries(next);
    });
  }, []);

  useFocusEffect(refresh);

  useEffect(() => subscribeToStorage(local, refresh), [refresh]);

  return entries;
}
