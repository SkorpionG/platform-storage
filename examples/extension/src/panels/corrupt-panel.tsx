import { appSchema, CORRUPTIONS, POLICIES } from "@examples/schema";
import type { AppKey, PolicyName, ValueCorruption } from "@examples/schema";
import { Badge, Button, Card, Code, Select, Value } from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/extension";
import { useState } from "react";
import { browser } from "wxt/browser";

import { local, localRecovering } from "../store/storages";

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
type Outcome = ReadOutcome | FailedOutcome;

/** Writes past the library, the way a previous version of an extension or a value synced from an older install would. */
async function plant(corruption: ValueCorruption): Promise<void> {
  await browser.storage.local.set({ [appSchema.physicalKeys[corruption.key]]: corruption.value });
}

async function readWithPolicy(key: AppKey, policy: PolicyName): Promise<Outcome> {
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
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});

  return (
    <Card
      title="Persisted data outlives the code that wrote it"
      description="These buttons write bad values straight through the storage area, behind the library's back. That is what an older release, another script in the same extension, or a value synced from a device still running last year's version leaves behind."
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
        {PLANTABLE.map((corruption) => {
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

              <Button tone="danger" onClick={() => void plant(corruption)}>
                Plant
              </Button>
              <Button
                onClick={() =>
                  void readWithPolicy(corruption.key, policy).then((next) => {
                    setOutcomes((current) => ({ ...current, [corruption.label]: next }));
                  })
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
