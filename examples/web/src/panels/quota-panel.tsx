"use client";

import { Badge, Button, Card, Code, Outcome } from "@examples/ui";
import { isPlatformStorageError } from "@platform-storage/web";
import { useState } from "react";

import { local } from "../store/storage";

/* Past every browser's `localStorage` quota, which is about five million characters per origin. */
const TOO_LARGE = 12_000_000;

interface Attempt {
  readonly label: string;
  readonly refused: boolean;
  /** Whether the list read the same afterwards, which is the claim: a refused write changes nothing. */
  readonly unchanged: boolean;
}

function writeTooMuch(): Attempt {
  const before = JSON.stringify(local.getSync("recentSearches"));

  try {
    local.setSync("recentSearches", ["x".repeat(TOO_LARGE)]);
    return { label: "written", refused: false, unchanged: false };
  } catch (error) {
    return {
      label: isPlatformStorageError(error) ? `${error.name} · ${error.code}` : "Error",
      refused: true,
      unchanged: JSON.stringify(local.getSync("recentSearches")) === before,
    };
  }
}

export function QuotaPanel() {
  const [attempt, setAttempt] = useState<Attempt | undefined>();

  return (
    <Card
      title="A write the browser refuses"
      lead="Try to store twelve million characters. The browser says no, and nothing changes."
      how={
        <>
          <p>
            The value passes the schema, since <Code>recentSearches</Code> is a list of any strings,
            so it is the browser that refuses it. The library does not police quotas or pretend to
            know them: the browser&rsquo;s refusal is wrapped as a <Code>QUOTA</Code> error with the
            original kept as its <Code>cause</Code>, and reported to <Code>onError</Code>.
          </p>
          <p>
            The browser suite goes further and fills a real origin in Chromium, Firefox and WebKit,
            each of which names the error differently.
          </p>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button tone="danger" onClick={() => setAttempt(writeTooMuch())}>
          Write 12 MB to recentSearches
        </Button>
      </div>

      {attempt === undefined ? null : (
        <div className="mt-3 space-y-1.5">
          <Outcome label="The write">
            <output aria-label="Quota outcome">
              <Badge tone={attempt.refused ? "danger" : "warning"}>{attempt.label}</Badge>
            </output>
          </Outcome>
          {attempt.refused ? (
            <Outcome label="Recent searches afterwards">
              <Badge tone={attempt.unchanged ? "success" : "warning"}>
                {attempt.unchanged ? "unchanged ✓" : "changed"}
              </Badge>
            </Outcome>
          ) : null}
        </div>
      )}
    </Card>
  );
}
