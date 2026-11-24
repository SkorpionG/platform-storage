"use client";

import { storedNamesOf } from "@examples/schema";
import { Badge, Button, Card, Code, Field, Outcome } from "@examples/ui";
import { notifyStorageChanged } from "@platform-storage/react";
import { isSyncStorageAdapter } from "@platform-storage/web";
import { useState, useSyncExternalStore } from "react";

import {
  getOriginServerSnapshot,
  getOriginSnapshot,
  readOriginNames,
  subscribeToOrigin,
} from "../store/origin";
import {
  adopting,
  local,
  localRecovering,
  TEAM_A_PREFIX,
  teamA,
  teamB,
  tour,
} from "../store/storage";

const FOREIGN_KEY = "analytics:session";
const LEFTOVER = `${TEAM_A_PREFIX}draft`;
const DECLARED = storedNamesOf([local]);

/* Every storage over this origin, since a clear of the whole origin is announced only by the storage that made it. */
function notifyEveryStorage(): void {
  notifyStorageChanged(local);
  notifyStorageChanged(localRecovering);
  notifyStorageChanged(teamA);
  notifyStorageChanged(teamB);
  notifyStorageChanged(adopting);
  notifyStorageChanged(tour);
}

/* Through the adapter rather than `window`, so a backend that is not there plants nothing rather than throwing. */
function plant(name: string, value: string): void {
  const { adapter } = local;

  if (!isSyncStorageAdapter(adapter)) return;

  try {
    adapter.setSync(name, JSON.stringify(value));
  } catch {
    return;
  }

  notifyStorageChanged(local);
}

interface LastRun {
  readonly call: string;
  readonly removed: ReadonlyArray<string>;
}

/** Runs a clear and reports which names it took, by listing the origin either side of it. */
function measure(call: string, run: () => void): LastRun {
  const before = readOriginNames();
  run();
  const after = readOriginNames();

  return { call, removed: [...before].filter((name) => !after.has(name)) };
}

export function ClearPanel() {
  const entries = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getOriginServerSnapshot,
  );
  const [last, setLast] = useState<LastRun | undefined>();

  const declared = entries.filter((entry) => DECLARED.has(entry.key)).length;
  const has = (name: string): boolean => entries.some((entry) => entry.key === name);

  return (
    <Card
      title="Clear"
      lead="Plant a key that belongs to someone else, then try each clear and see what it took."
      how={
        <>
          <p>
            An origin is shared. Another script, another library or another storage may keep things
            beside yours, so wiping the whole origin has to be asked for by name.
          </p>
          <p>
            <Code>clearSync()</Code> removes the declared names one at a time, since{" "}
            <Code>localStorage</Code> has no batch call. <Code>&quot;undeclared&quot;</Code> lists
            the origin and removes the names under Team A&rsquo;s prefix that its schema no longer
            lists; nothing declared changes, so nothing is announced and the card tells the page
            itself. <Code>&quot;everything&quot;</Code> is one <Code>localStorage.clear()</Code>,
            which other tabs hear from the browser.
          </p>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-line bg-inset px-3 py-2">
        <Outcome label="Schema keys stored">
          <Badge>{declared}</Badge>
        </Outcome>
        <Outcome label={FOREIGN_KEY}>
          <Badge tone={has(FOREIGN_KEY) ? "info" : "neutral"}>
            {has(FOREIGN_KEY) ? "present" : "absent"}
          </Badge>
        </Outcome>
        <Outcome label={LEFTOVER}>
          <Badge tone={has(LEFTOVER) ? "info" : "neutral"}>
            {has(LEFTOVER) ? "present" : "absent"}
          </Badge>
        </Outcome>
        {last === undefined ? null : (
          <div className="w-full border-t border-line pt-1.5">
            <Outcome label={<Code>{last.call}</Code>}>
              <output aria-label="Clear removed" className="flex flex-wrap items-center gap-1.5">
                {last.removed.length === 0 ? (
                  <span className="text-faint">removed nothing</span>
                ) : (
                  <>
                    <span className="text-soft">removed {last.removed.length}:</span>
                    {last.removed.map((name) => (
                      <Badge key={name}>{name}</Badge>
                    ))}
                  </>
                )}
              </output>
            </Outcome>
          </div>
        )}
      </div>

      <div className="divide-y divide-line">
        <Field label="Only what the schema declares" hint={<>{FOREIGN_KEY} survives this one.</>}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                plant(FOREIGN_KEY, "belongs to someone else");
              }}
            >
              Plant a foreign key
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                setLast(measure("clearSync()", () => local.clearSync()));
              }}
            >
              clearSync()
            </Button>
          </div>
        </Field>

        <Field
          label="What a schema no longer declares"
          hint={<>{LEFTOVER} is what a key deleted from Team A&rsquo;s schema leaves behind.</>}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                plant(LEFTOVER, "from a deleted key");
              }}
            >
              Plant a leftover
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                setLast(
                  measure('clearSync("undeclared")', () => {
                    teamA.clearSync("undeclared");
                    notifyStorageChanged(teamA);
                  }),
                );
              }}
            >
              clearSync(&quot;undeclared&quot;)
            </Button>
          </div>
        </Field>

        <Field label="The whole origin" hint="Every name, other code's included.">
          <Button
            tone="danger"
            onClick={() => {
              setLast(
                measure('clearSync("everything")', () => {
                  local.clearSync("everything");
                  notifyEveryStorage();
                }),
              );
            }}
          >
            clearSync(&quot;everything&quot;)
          </Button>
        </Field>
      </div>
    </Card>
  );
}
