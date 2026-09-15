import { DECLARED_PHYSICAL_KEYS } from "@examples/schema";
import type { ExtensionStorageAreaName } from "@platform-storage/extension";
import { subscribeToStorage } from "@platform-storage/react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { local, session, sync } from "../store/storages";

export interface AreaEntry {
  readonly key: string;
  /** What the area holds, which for an extension is the value itself rather than text. */
  readonly value: unknown;
  readonly ours: boolean;
}

export interface AreaContents {
  readonly entries: ReadonlyArray<AreaEntry>;
  /** Why the area could not be read, where it could not be. `session` on Manifest V2 is the case that matters. */
  readonly failure: string | undefined;
}

const STORAGES = { local, sync, session } as const;

const EMPTY: AreaContents = Object.freeze({ entries: [], failure: undefined });

async function read(area: ExtensionStorageAreaName): Promise<AreaContents> {
  try {
    const held = await browser.storage[area].get();

    const entries = Object.entries(held)
      .map(([key, value]) => ({ key, value, ours: DECLARED_PHYSICAL_KEYS.has(key) }))
      .toSorted((left, right) => left.key.localeCompare(right.key));

    return { entries, failure: undefined };
  } catch (error) {
    return { entries: [], failure: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Everything an area holds, including keys the schema never declared.
 *
 * The web inspector reads the origin synchronously and caches a snapshot for `useSyncExternalStore`. An area answers with a promise, so that pattern does not port and this keeps the answer in state instead, re-reading whenever the storage over that area reports a change.
 */
export function useAreaContents(area: ExtensionStorageAreaName): AreaContents {
  const [contents, setContents] = useState<AreaContents>(EMPTY);

  useEffect(() => {
    let live = true;

    const refresh = (): void => {
      void read(area).then((next) => {
        if (live) setContents(next);
      });
    };

    refresh();
    const stop = subscribeToStorage(STORAGES[area], refresh);

    return () => {
      live = false;
      stop();
    };
  }, [area]);

  return contents;
}
