import { storedNamesOf } from "@examples/schema";
import type { WebExtensionStorageAreaName } from "@platform-storage/webextension";
import { useEffect, useState } from "react";

import { local, session, sync } from "../store/storages";

interface AreaEntry {
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

async function read(area: WebExtensionStorageAreaName): Promise<AreaContents> {
  try {
    const storage = STORAGES[area];
    const { adapter } = storage;
    const ours = storedNamesOf([storage]);
    const names = (await adapter.keys?.()) ?? [];

    const held = await Promise.all(
      names.map(async (key) => ({
        key,
        value: await adapter.get(key),
        ours: ours.has(key),
      })),
    );
    const entries = held.toSorted((left, right) => left.key.localeCompare(right.key));

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
export function useAreaContents(area: WebExtensionStorageAreaName): AreaContents {
  const [contents, setContents] = useState<AreaContents>(EMPTY);

  useEffect(() => {
    let live = true;

    const refresh = (): void => {
      void read(area).then((next) => {
        if (live) setContents(next);
      });
    };

    refresh();
    const subscription = STORAGES[area].adapter.subscribe?.(refresh);

    return () => {
      live = false;
      subscription?.stop();
    };
  }, [area]);

  return contents;
}
