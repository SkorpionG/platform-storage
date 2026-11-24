import { isPlatformStorageError } from "@platform-storage/core";
import type { MaybePromise, PlatformStorage } from "@platform-storage/core";

import type { AppDefinition } from "./schema";

/**
 * The prefix every app builds its tour storage under.
 *
 * The tour plants bad data and clears what it wrote, so it runs inside a prefix of its own and never touches a value another card is showing.
 */
export const TOUR_PREFIX = "tour:";

/** The behaviors every demo shows, as stable identifiers an app can map to the tab that shows each one in full. */
export const TOUR_CHECK = {
  Default: "default",
  Refused: "refused",
  Fallback: "fallback",
  Logged: "logged",
  Throw: "throw",
  Clear: "clear",
  Physical: "physical",
} as const;

export type TourCheckId = (typeof TOUR_CHECK)[keyof typeof TOUR_CHECK];

export interface TourCheck {
  readonly id: TourCheckId;
  /** The claim the check proves, written so a backticked run is code. */
  readonly label: string;
}

/** In the order they run, which is also the order they are shown. */
export const TOUR_CHECKS: ReadonlyArray<TourCheck> = [
  { id: TOUR_CHECK.Default, label: "A declared default answers for an empty key" },
  { id: TOUR_CHECK.Refused, label: "A value the schema rejects is never written" },
  { id: TOUR_CHECK.Fallback, label: "Bad stored data reads as the default" },
  { id: TOUR_CHECK.Logged, label: "That fallback is reported to `onError`" },
  { id: TOUR_CHECK.Throw, label: '`onInvalid: "throw"` rejects instead' },
  { id: TOUR_CHECK.Clear, label: "`clear()` leaves other code's keys alone" },
  { id: TOUR_CHECK.Physical, label: "A key can be stored under another name" },
];

export interface TourResult {
  readonly id: TourCheckId;
  readonly ok: boolean;
  /** What actually came back, so a pass can be checked by eye and a failure explains itself. */
  readonly detail: string;
}

/** Everything a run produced: a result for every check, and what went wrong around them, if anything did. */
export interface TourRun {
  readonly results: ReadonlyArray<TourResult>;
  /** Why the tour could not prepare its storage or tidy up after itself, which no single check owns. */
  readonly problem: string | undefined;
}

/** What the tour needs from a platform beyond the storage itself. */
export interface TourBackend {
  /** Writes a value under a physical name, past the library, the way a hand edit or an older release would. */
  plant(name: string, value: unknown): MaybePromise<void>;
  /** Whether anything at all is stored under a physical name. */
  holds(name: string): MaybePromise<boolean>;
  /** Removes a physical name past the library, so the tour can tidy up the key it planted for someone else. */
  remove(name: string): MaybePromise<void>;
  /** How many failures the tour storage has reported through `onError` so far. */
  failures(): number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* The prefix holds only what the tour wrote, so emptying it is the whole of setting up and of tidying up. */
async function emptyPrefix(
  tour: PlatformStorage<AppDefinition>,
  backend: TourBackend,
  foreign: string,
): Promise<void> {
  await tour.clear();
  await backend.remove(foreign);
}

function show(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** The code a call was rejected with, or `undefined` if it was not rejected at all. */
async function rejection(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call;
    return undefined;
  } catch (error) {
    return isPlatformStorageError(error) ? error.code : "an error that is not the library's";
  }
}

/**
 * Runs every check against a storage built over `appSchema` with `prefix: TOUR_PREFIX`, and leaves that prefix empty afterwards.
 *
 * Each check is independent of the others' outcome, so one failing reports itself and the rest still run. It never rejects: a backend refusing to set up or tidy up is reported as the run's `problem`, so a caller can always leave its running state.
 */
export async function runTour(
  tour: PlatformStorage<AppDefinition>,
  backend: TourBackend,
): Promise<TourRun> {
  const results: Array<TourResult> = [];
  const foreign = `${TOUR_PREFIX}analytics`;
  let failuresBefore = 0;

  /* Keyed by check, so every check in `TOUR_CHECKS` has exactly one step and a new one fails to compile until it is written. */
  const steps: { readonly [Id in TourCheckId]: () => Promise<Omit<TourResult, "id">> } = {
    [TOUR_CHECK.Default]: async () => {
      const theme = await tour.get("theme");
      const displayName = await tour.get("displayName");

      return {
        ok: theme === "system" && displayName === undefined,
        detail: `theme → ${show(theme)}, displayName → ${show(displayName)}`,
      };
    },
    [TOUR_CHECK.Refused]: async () => {
      const code = await rejection(tour.set("fontScale", 12));
      const written = await backend.holds(tour.physicalKey("fontScale"));

      return {
        ok: code !== undefined && !written,
        detail: `set("fontScale", 12) → ${code ?? "accepted"}`,
      };
    },
    [TOUR_CHECK.Fallback]: async () => {
      failuresBefore = backend.failures();
      await backend.plant(tour.physicalKey("theme"), "solarized");
      const theme = await tour.get("theme");

      return { ok: theme === "system", detail: `stored "solarized" → reads ${show(theme)}` };
    },
    [TOUR_CHECK.Logged]: async () => {
      const reported = backend.failures() - failuresBefore;

      return {
        ok: reported > 0,
        detail: `${String(reported)} new ${reported === 1 ? "entry" : "entries"} in the error log`,
      };
    },
    [TOUR_CHECK.Throw]: async () => {
      const code = await rejection(tour.get("theme", { onInvalid: "throw" }));

      return { ok: code !== undefined, detail: `get("theme") → ${code ?? "no error"}` };
    },
    [TOUR_CHECK.Clear]: async () => {
      await tour.set("visitCount", 3);
      await backend.plant(foreign, "belongs to someone else");
      await tour.clear();

      const declaredLeft = await backend.holds(tour.physicalKey("visitCount"));
      const foreignKept = await backend.holds(foreign);

      return {
        ok: !declaredLeft && foreignKept,
        detail: `visitCount ${declaredLeft ? "still there" : "removed"}, ${foreign} ${foreignKept ? "kept" : "removed"}`,
      };
    },
    [TOUR_CHECK.Physical]: async () => {
      await tour.set("user", { id: "u_tour", name: "Ada" });

      const physical = tour.physicalKey("user");
      const underPhysical = await backend.holds(physical);
      const underLogical = await backend.holds(`${TOUR_PREFIX}user`);

      return {
        ok: underPhysical && !underLogical,
        detail: `user is stored as ${physical}`,
      };
    },
  };

  /*
    Starts from nothing, so a default is a default and not a leftover from an earlier run. The foreign key is removed by name rather than with `clear("undeclared")`, which needs a backend that can list what it holds.
  */
  try {
    await emptyPrefix(tour, backend, foreign);
  } catch (error) {
    /* Not run rather than run against whatever an earlier run left: a check over stale data would pass or fail for the wrong reason. */
    return {
      results: TOUR_CHECKS.map(({ id }) => ({ id, ok: false, detail: "not run" })),
      problem: `The tour could not empty its storage first: ${messageOf(error)}`,
    };
  }

  for (const { id } of TOUR_CHECKS) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each step reads what the one before it left behind, so running them together would race the plant against the read it is there to provoke.
      results.push({ id, ...(await steps[id]()) });
    } catch (error) {
      results.push({ id, ok: false, detail: messageOf(error) });
    }
  }

  /* The checks have answered by now, so a failure here is reported beside their results rather than in place of them. */
  try {
    await emptyPrefix(tour, backend, foreign);
  } catch (error) {
    return {
      results,
      problem: `The checks ran, but the tour could not clear up after itself: ${messageOf(error)}`,
    };
  }

  return { results, problem: undefined };
}
