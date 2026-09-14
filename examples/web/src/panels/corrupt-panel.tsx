"use client";

import { appSchema, CORRUPTIONS } from "@examples/schema";
import type { AppKey, Corruption } from "@examples/schema";
import { Badge, Button, Card, Code, Select, Value } from "@examples/ui";
import { INVALID_POLICY, isPlatformStorageError } from "@platform-storage/web";
import type { InvalidPolicy } from "@platform-storage/web";
import { useState } from "react";

import { local, localRecovering } from "../store/storage";
import { useWrite } from "../hooks/use-storage";

/** The policies the library names, plus the callback it also accepts. */
type PolicyName = InvalidPolicy | "callback";

/** Keyed by every policy, so one added to the library fails to compile until it is described here. */
const POLICY_LABELS: { readonly [Name in PolicyName]: string } = {
  fallback: "fallback — the built-in default",
  throw: "throw — reject the read",
  remove: "remove — delete, then fall back",
  callback: "callback — decide per read",
};

const POLICIES: ReadonlyArray<{
  readonly value: PolicyName;
  readonly label: string;
}> = [...Object.values(INVALID_POLICY), "callback" as const].map((value) => ({
  value,
  label: POLICY_LABELS[value],
}));

interface ReadOutcome {
  readonly kind: "read";
  readonly value: unknown;
}

interface FailedOutcome {
  readonly kind: "failed";
  readonly label: string;
}

type Outcome = ReadOutcome | FailedOutcome;

/** Writes past the library, the way a previous version of an app or a hand edit would. */
function plant(corruption: Corruption): void {
  const physical = appSchema.physicalKeys[corruption.key];

  window.localStorage.setItem(
    physical,
    corruption.kind === "text" ? corruption.text : JSON.stringify(corruption.value),
  );
}

function readWithPolicy(key: AppKey, policy: PolicyName): Outcome {
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
  const write = useWrite();
  const [policy, setPolicy] = useState<PolicyName>("fallback");
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});

  return (
    <Card
      title="Persisted data outlives the code that wrote it"
      description="These buttons write bad values straight through window.localStorage, behind the library's back. That is what an older release, a hand edit, or another script on the same origin leaves behind."
      aside={
        <Select
          label="Invalid-data policy"
          value={policy}
          options={POLICIES}
          onChange={(next) => {
            setPolicy(next);
            setOutcomes({});
          }}
        />
      }
    >
      <div className="space-y-2">
        {CORRUPTIONS.map((corruption) => {
          const outcome = outcomes[corruption.label];

          return (
            <div
              key={corruption.label}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-inset px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Code>{corruption.key}</Code>
                  <span className="text-xs font-medium text-body">{corruption.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-soft">{corruption.explains}</p>
              </div>

              <Button tone="danger" onClick={() => write(() => plant(corruption))}>
                Plant
              </Button>
              <Button
                onClick={() =>
                  write(() =>
                    setOutcomes((current) => ({
                      ...current,
                      [corruption.label]: readWithPolicy(corruption.key, policy),
                    })),
                  )
                }
              >
                Read
              </Button>

              <div className="w-52 text-right">
                {outcome === undefined ? (
                  <span className="text-xs text-faint">not read yet</span>
                ) : outcome.kind === "read" ? (
                  <Value value={outcome.value} />
                ) : (
                  <Badge tone="danger">{outcome.label}</Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-soft">
        Whichever policy runs, the failure still reaches the{" "}
        <span className="font-mono text-muted">onError</span> observer, so a fallback is never
        silent — watch the event log. Under <span className="font-mono text-muted">remove</span> the
        entry disappears from the inspector; under the others the bad value stays where it is, ready
        for a future migration.
      </p>
    </Card>
  );
}
