import { describe, expect, it } from "vitest";

import { chain, expectSync, isPromiseLike } from "../maybe-promise";

describe("isPromiseLike", () => {
  it("recognizes a native promise", () => {
    expect(isPromiseLike(Promise.resolve(1))).toBe(true);
  });

  it("recognizes a thenable from another implementation, since a backend may hand one back", () => {
    expect(isPromiseLike({ then: () => undefined } as unknown as Promise<number>)).toBe(true);
  });

  it("rejects a value that merely has a `then` property", () => {
    expect(isPromiseLike({ then: 1 } as unknown as Promise<number>)).toBe(false);
  });

  it("rejects a plain object, null and a primitive", () => {
    expect(isPromiseLike({})).toBe(false);
    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(0)).toBe(false);
    expect(isPromiseLike("then")).toBe(false);
    expect(isPromiseLike(undefined)).toBe(false);
  });

  it("recognizes a callable thenable, which a function-shaped value can be", () => {
    const thenable = Object.assign(() => undefined, { then: () => undefined });

    expect(isPromiseLike(thenable as unknown as Promise<number>)).toBe(true);
  });
});

describe("chain", () => {
  it("continues without waiting when the value is not a promise", () => {
    let seen: number | undefined;

    const result = chain(1, (value) => {
      seen = value;
      return value + 1;
    });

    // Both assertions before any microtask can run, which is what proves the path stayed synchronous.
    expect(seen).toBe(1);
    expect(result).toBe(2);
  });

  it("waits for a value that has to be awaited", async () => {
    expect(await chain(Promise.resolve(1), (value) => value + 1)).toBe(2);
  });

  it("answers with a promise when the continuation does, even over a value that was not one", async () => {
    const result = chain(1, (value) => Promise.resolve(value + 1));

    expect(isPromiseLike(result)).toBe(true);
    expect(await result).toBe(2);
  });

  it("lets a synchronous throw out synchronously, rather than turning it into a rejection", () => {
    expect(() =>
      chain(1, () => {
        throw new Error("no");
      }),
    ).toThrow("no");
  });
});

describe("expectSync", () => {
  it("unwraps a value that was never a promise", () => {
    expect(expectSync(1, () => new Error("unreachable"))).toBe(1);
  });

  it("throws what it is given when the value turns out to need awaiting", () => {
    expect(() => expectSync(Promise.resolve(1), () => new Error("adapter lied"))).toThrow(
      "adapter lied",
    );
  });

  it("builds the error only when it fires", () => {
    let built = 0;

    expectSync(1, () => {
      built += 1;
      return new Error("unreachable");
    });

    expect(built).toBe(0);
  });
});
