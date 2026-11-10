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

describe("a turn over several keys", () => {
  it("runs immediately when nothing is ahead on any of them", () => {
    expect(createWriteQueue().runAll(["a", "b"], () => 1)).toBe(1);
  });

  it("waits for every key's earlier task, and holds every key until it finishes", async () => {
    const queue = createWriteQueue();
    const onA = gate();
    const onB = gate();
    const holding = gate();
    const order: Array<string> = [];

    void queue.run("a", () => onA.opened.then(() => order.push("a")));
    void queue.run("b", () => onB.opened.then(() => order.push("b")));
    const both = queue.runAll(["a", "b"], () => {
      order.push("both starts");

      return holding.opened.then(() => order.push("both ends"));
    });
    const afterA = queue.run("a", () => {
      order.push("after a");
    });
    const afterB = queue.run("b", () => {
      order.push("after b");
    });

    onA.open();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(order).toEqual(["a"]);

    onB.open();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(order).toEqual(["a", "b", "both starts"]);

    holding.open();
    await Promise.all([both, afterA, afterB]);

    expect(order).toEqual(["a", "b", "both starts", "both ends", "after a", "after b"]);
  });

  it("cannot deadlock with another turn over the same keys in the other order", async () => {
    const queue = createWriteQueue();
    const earlier = gate();
    const order: Array<string> = [];

    /* Taking the keys one after another would deadlock here: the first would hold "a" while waiting for "b", which the second holds while waiting for "a". */
    void queue.run("a", () => earlier.opened);
    const first = queue.runAll(["a", "b"], () => {
      order.push("ab");
    });
    const second = queue.runAll(["b", "a"], () => {
      order.push("ba");
    });

    earlier.open();
    await Promise.all([first, second]);

    expect(order).toEqual(["ab", "ba"]);
  });

  it("lets go of every key once it settles, even after a failure", async () => {
    const queue = createWriteQueue();

    await expect(
      queue.runAll(["a", "b"], () => Promise.reject(new Error("refused"))),
    ).rejects.toThrow("refused");

    expect(queue.settled("a")).toBeUndefined();
    expect(queue.settled("b")).toBeUndefined();
  });
});
