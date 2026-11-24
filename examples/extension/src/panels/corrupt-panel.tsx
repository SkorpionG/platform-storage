import { CORRUPTIONS, POLICIES } from "@examples/schema";
import type { AppKey, PolicyName, ValueCorruption } from "@examples/schema";
import {
  Badge,
  Button,
  Card,
  Code,
  formatValue,
  Outcome,
  Prose,
  Select,
  Value,
} from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/webextension";
import { useState } from "react";
import { browser } from "wxt/browser";

import { useAreaContents } from "../hooks/use-area-contents";
import { failuresSoFar, local, localRecovering } from "../store/storages";

/*
  An extension area transports JSON values rather than text, so the one corruption that is text which is not JSON at all has no equivalent here: there is no encoding step to fail in. `@examples/schema` marks that entry `kind: "text"` for exactly this reason.
*/
const PLANTABLE: ReadonlyArray<ValueCorruption> = CORRUPTIONS.filter(
  (corruption) => corruption.kind === "value",
);

interface ReadOutcome {
  readonly kind: "read";
  readonly value: unknown;
}
interface FailedOutcome {
  readonly kind: "failed";
  readonly label: string;
}
type ReadResult = (ReadOutcome | FailedOutcome) & {
  /** Whether a failure was reported while the read ran, which is what keeps a fallback from being silent. */
  readonly logged: boolean;
};

/** Writes past the library, the way a previous version of an extension or a value synced from an older install would. */
async function plant(corruption: ValueCorruption): Promise<void> {
  await browser.storage.local.set({ [local.physicalKey(corruption.key)]: corruption.value });
}

async function readWithPolicy(key: AppKey, policy: PolicyName): Promise<ReadResult> {
  const before = failuresSoFar();
  const read = await attempt(key, policy);

  return { ...read, logged: failuresSoFar() > before };
}

async function attempt(key: AppKey, policy: PolicyName): Promise<ReadOutcome | FailedOutcome> {
  try {
    // The callback policy is declared on its own storage, because a per-call callback is checked against the one key being read and this reads whichever key the row names.
    const value =
      policy === "callback"
        ? await localRecovering.get(key)
        : await local.get(key, { onInvalid: policy });

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
  const { entries } = useAreaContents("local");

  const storedNow = (key: AppKey): string | undefined => {
    const entry = entries.find((candidate) => candidate.key === local.physicalKey(key));
    return entry === undefined ? undefined : formatValue(entry.value);
  };

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
            Plant writes straight through <Code>browser.storage.local</Code>, behind the
            library&rsquo;s back: what an older release, another script in the same extension, or a
            value synced from a device still on last year&rsquo;s version leaves behind. The browser
            reports the write, every hook reading that key reads it again, falls back and reports
            it, which is why the Error log moves before you press Read.
          </p>
          <p>
            Read uses the policy you picked. <Code>fallback</Code> answers with the default and
            leaves the bad value stored. <Code>throw</Code> rejects the read. <Code>remove</Code>{" "}
            deletes the stored value, then falls back. The callback decides per read, and here
            answers with the declared default. Text that is not JSON has no row here: an area stores
            values, so there is no encoding step to fail.
          </p>
          <p>
            Reads here are asynchronous, so a hook re-reading the same key at that moment can also
            mark a read as logged.
          </p>
        </>
      }
    >
      <div className="space-y-2">
        {PLANTABLE.map((corruption) => {
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

                <Button tone="danger" onClick={() => void plant(corruption)}>
                  Plant
                </Button>
                <Button
                  onClick={() =>
                    void readWithPolicy(corruption.key, policy).then((next) => {
                      setResults((current) => ({ ...current, [corruption.label]: next }));
                    })
                  }
                >
                  Read
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
                <Outcome label="Plants">
                  <Code>{formatValue(corruption.value)}</Code>
                </Outcome>
                <Outcome label="Stored now">
                  {stored === undefined ? (
                    <span className="text-faint">nothing</span>
                  ) : (
                    <Code>{stored}</Code>
                  )}
                </Outcome>
                <Outcome label="Read">
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
                </Outcome>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
