import { describe, expect, it } from "vitest";

import { gate } from "../../../tests/fakes/adapters";
import { createWriteQueue } from "../write-queue";

describe("createWriteQueue", () => {
  it("runs a task immediately when nothing is ahead of it", () => {
    expect(createWriteQueue().run("a", () => 1)).toBe(1);
  });

  it("answers immediately when asked about a key with nothing running", () => {
    expect(createWriteQueue().settled("a")).toBeUndefined();
  });

  it("runs tasks on one key one at a time, in order", async () => {
    const queue = createWriteQueue();
    const first = gate();
    const order: Array<string> = [];

    const running = queue.run("a", () =>
      first.opened.then(() => {
        order.push("first");
      }),
    );
    const next = queue.run("a", () => {
      order.push("second");
    });

    expect(order).toEqual([]);

    first.open();
    await Promise.all([running, next]);

    expect(order).toEqual(["first", "second"]);
  });

  it("leaves other keys unaffected", () => {
    const queue = createWriteQueue();

    void queue.run("a", () => gate().opened);

    expect(queue.run("b", () => 1)).toBe(1);
  });

  it("runs the next task after one rejects, and leaves the rejection with its caller", async () => {
    const queue = createWriteQueue();

    const refused = queue.run("a", () => Promise.reject(new Error("refused")));
    const next = queue.run("a", () => "ran");

    await expect(refused).rejects.toThrow("refused");
    await expect(next).resolves.toBe("ran");
  });

  it("reports a key as settled only once its tasks have finished", async () => {
    const queue = createWriteQueue();
    const running = gate();
    let settled = false;

    void queue.run("a", () => running.opened);
    void Promise.resolve(queue.settled("a")).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    running.open();
    await running.opened;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(settled).toBe(true);
    expect(queue.settled("a")).toBeUndefined();
  });

  it("keeps a key busy until its last task has finished", async () => {
    const queue = createWriteQueue();
    const first = gate();
    const second = gate();

    const running = queue.run("a", () => first.opened);
    void queue.run("a", () => second.opened);

    first.open();
    await running;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(queue.settled("a")).toBeInstanceOf(Promise);

    second.open();
  });
});
