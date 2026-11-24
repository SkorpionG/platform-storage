"use client";

import { CORRUPTIONS, POLICIES } from "@examples/schema";
import type { AppKey, Corruption, PolicyName } from "@examples/schema";
import { Badge, Button, Card, Code, Outcome, Prose, Select, Value } from "@examples/ui";
import { notifyStorageChanged } from "@platform-storage/react";
import { isPlatformStorageError } from "@platform-storage/web";
import { useState, useSyncExternalStore } from "react";

import { getOriginServerSnapshot, getOriginSnapshot, subscribeToOrigin } from "../store/origin";
import { failuresSoFar, local, localRecovering } from "../store/storage";

interface ReadOutcome {
  readonly kind: "read";
  readonly value: unknown;
}

interface FailedOutcome {
  readonly kind: "failed";
  readonly label: string;
}

type ReadResult = (ReadOutcome | FailedOutcome) & {
  /** Whether the read reached `onError`, which is what keeps a fallback from being silent. */
  readonly logged: boolean;
};

/** The text a corruption leaves behind, which is what the row says it will plant. */
function plantedText(corruption: Corruption): string {
  return corruption.kind === "text" ? corruption.text : JSON.stringify(corruption.value);
}

/** Writes past the library, the way a previous version of an app or a hand edit would. */
function plant(corruption: Corruption): void {
  window.localStorage.setItem(local.physicalKey(corruption.key), plantedText(corruption));
}

function readWithPolicy(key: AppKey, policy: PolicyName): ReadResult {
  const before = failuresSoFar();
  const read = attempt(key, policy);

  return { ...read, logged: failuresSoFar() > before };
}

function attempt(key: AppKey, policy: PolicyName): ReadOutcome | FailedOutcome {
  try {
    // The callback policy is declared on its own storage, because a per-call callback is checked against the one key being read and this reads whichever key the row names.
    const value =
      policy === "callback"
        ? localRecovering.getSync(key)
        : local.getSync(key, { onInvalid: policy });

    return { kind: "read", value };
  } catch (error) {
    return {
      kind: "failed",
      label: isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
    };
  }
}

export function CorruptPanel() {
  const [policy, setPolicy] = useState<PolicyName>("fallback");
  const [results, setResults] = useState<Readonly<Record<string, ReadResult>>>({});
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getOriginServerSnapshot,
  );

  const storedNow = (key: AppKey): string | undefined =>
    origin.find((entry) => entry.key === local.physicalKey(key))?.raw;

  return (
    <Card
      title="Corrupt data"
      lead="Pick a policy, plant a bad value, then read it back. Planting alone already adds to the Error log, because other cards read the same key."
      aside={
        <Select
          label="Invalid-data policy"
          value={policy}
          options={POLICIES}
          onChange={(next) => {
            setPolicy(next);
            setResults({});
          }}
        />
      }
      how={
        <>
          <p>
            Plant writes straight through <Code>window.localStorage</Code>, behind the
            library&rsquo;s back: what an older release, a hand edit, or another script on the same
            origin leaves behind. Every hook on the page reading that key reads it again at once,
            falls back, and reports it, which is why the Error log moves before you press Read.
          </p>
          <p>
            Read uses the policy you picked. <Code>fallback</Code> answers with the default and
            leaves the bad value stored, ready for a future migration. <Code>throw</Code> rejects
            the read. <Code>remove</Code> deletes the stored value, then falls back. The callback
            decides per read, and here answers with the declared default. Whichever runs, the
            failure reaches <Code>onError</Code>, so a fallback is never silent.
          </p>
        </>
      }
    >
      <div className="space-y-2">
        {CORRUPTIONS.map((corruption) => {
          const result = results[corruption.label];
          const stored = storedNow(corruption.key);

          return (
            <div
              key={corruption.label}
              className="rounded-lg border border-line bg-inset px-3 py-2"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Code>{corruption.key}</Code>
                    <span className="text-xs font-medium text-body">{corruption.label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-soft">
                    <Prose text={corruption.explains} />
                  </p>
                </div>

                <Button
                  tone="danger"
                  title={`Store ${plantedText(corruption)} under ${local.physicalKey(corruption.key)}`}
                  onClick={() => {
                    plant(corruption);
                    notifyStorageChanged(local, corruption.key);
                  }}
                >
                  Plant
                </Button>
                <Button
                  onClick={() => {
                    /* Read here rather than inside the state update, which React may run later or twice: the read is what removes the value under `remove`, and the page has to look again after it. */
                    const next = readWithPolicy(corruption.key, policy);
                    setResults((current) => ({ ...current, [corruption.label]: next }));
                    notifyStorageChanged(local, corruption.key);
                  }}
                >
                  Read
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
                <Outcome label="Plants">
                  <Code>{plantedText(corruption)}</Code>
                </Outcome>
                <Outcome label="Stored now">
                  {stored === undefined ? (
                    <span className="text-faint">nothing</span>
                  ) : (
                    <Code>{stored}</Code>
                  )}
                </Outcome>
                <Outcome label="Read">
                  <output
                    aria-label={`${corruption.label} read`}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {result === undefined ? (
                      <span className="text-faint">not yet</span>
                    ) : (
                      <>
                        {result.kind === "read" ? (
                          <Value value={result.value} />
                        ) : (
                          <Badge tone="danger">{result.label}</Badge>
                        )}
                        {result.logged ? <Badge tone="info">logged</Badge> : null}
                      </>
                    )}
                  </output>
                </Outcome>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
