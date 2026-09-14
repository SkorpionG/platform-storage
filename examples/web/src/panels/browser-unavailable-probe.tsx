"use client";

import { Badge, Button, Value } from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/web";
import { useState } from "react";

import { unguardedLocal } from "../store/storage";

type Outcome =
  | { readonly kind: "read"; readonly value: unknown }
  | {
      readonly kind: "failed";
      readonly label: string;
    };

/** The identical read the server made, run again where a `window` does exist. */
export function BrowserUnavailableProbe() {
  const [outcome, setOutcome] = useState<Outcome | undefined>();

  return (
    <div className="rounded-lg border border-line bg-inset p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-body">In this browser</div>
          <p className="mt-0.5 text-xs text-soft">
            The same storage, the same call, one environment along. Nothing about the storage
            changed; only what was there to reach.
          </p>
        </div>
        <Button
          onClick={() => {
            try {
              setOutcome({ kind: "read", value: unguardedLocal.getSync("theme") });
            } catch (error) {
              setOutcome({
                kind: "failed",
                label: isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
              });
            }
          }}
        >
          Read
        </Button>
      </div>

      {outcome === undefined ? null : (
        <div className="mt-2">
          {outcome.kind === "read" ? (
            <>
              <Badge tone="success">read succeeded</Badge>
              <span className="ml-2">
                <Value value={outcome.value} />
              </span>
            </>
          ) : (
            <Badge tone="danger">{outcome.label}</Badge>
          )}
        </div>
      )}
    </div>
  );
}
