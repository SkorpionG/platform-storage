import { createStorage, memoryAdapter } from "@platform-storage/core";
import { describe, expect, it } from "vitest";

import { appSchema } from "../schema";
import { runTour, TOUR_CHECKS, TOUR_PREFIX } from "../tour";
import type { TourBackend } from "../tour";

/** A tour storage over memory, and a backend reaching the same memory past the library, the way each app's does. */
function arrange(overrides: Partial<TourBackend> = {}) {
  const adapter = memoryAdapter({ initial: { theme: '"dark"' } });
  let failures = 0;
  const tour = createStorage({
    schema: appSchema,
    adapter,
    prefix: TOUR_PREFIX,
    onError: () => {
      failures += 1;
    },
  });
  const backend: TourBackend = {
    plant: (name, value) => adapter.setSync(name, JSON.stringify(value)),
    holds: (name) => adapter.getSync(name) !== undefined,
    remove: (name) => adapter.removeSync(name),
    failures: () => failures,
    ...overrides,
  };

  return { adapter, tour, backend };
}

/** A `remove` that refuses on the given call and passes every other through. */
function refusingRemoveOn(call: number, adapter: ReturnType<typeof arrange>["adapter"]) {
  let calls = 0;

  return (name: string): void => {
    calls += 1;
    if (calls === call) throw new Error("refused");
    adapter.removeSync(name);
  };
}

describe("runTour", () => {
  it("passes every check, in order, and reports no problem", async () => {
    const { tour, backend } = arrange();

    const run = await runTour(tour, backend);

    expect(run.problem).toBeUndefined();
    expect(run.results.map((result) => result.id)).toEqual(TOUR_CHECKS.map((check) => check.id));
    expect(run.results.filter((result) => !result.ok)).toEqual([]);
  });

  it("leaves its prefix empty and every other name alone", async () => {
    const { adapter, tour, backend } = arrange();

    await runTour(tour, backend);

    expect(Object.fromEntries(adapter.entries)).toEqual({ theme: '"dark"' });
  });

  it("reports a failing check and still runs the rest", async () => {
    const { tour, backend } = arrange({
      holds: (name) => {
        if (name.endsWith("fontScale")) throw new Error("could not look");
        return false;
      },
    });

    const run = await runTour(tour, backend);
    const refused = run.results.find((result) => result.id === "refused");

    expect(refused).toEqual({ id: "refused", ok: false, detail: "could not look" });
    expect(run.results).toHaveLength(TOUR_CHECKS.length);
  });

  it("runs nothing, and says why, when its storage cannot be emptied first", async () => {
    const { adapter, tour, backend } = arrange();

    const run = await runTour(tour, { ...backend, remove: refusingRemoveOn(1, adapter) });

    expect(run.problem).toMatch(/could not empty its storage first: refused/);
    expect(run.results.every((result) => !result.ok && result.detail === "not run")).toBe(true);
  });

  it("keeps the results, and says why, when it cannot tidy up after itself", async () => {
    const { adapter, tour, backend } = arrange();

    const run = await runTour(tour, { ...backend, remove: refusingRemoveOn(2, adapter) });

    expect(run.problem).toMatch(/could not clear up after itself: refused/);
    expect(run.results.every((result) => result.ok)).toBe(true);
  });
});
