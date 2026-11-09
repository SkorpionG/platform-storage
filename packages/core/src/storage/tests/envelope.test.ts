import { describe, expect, it } from "vitest";

import { unwrapStored, wrapEnvelope } from "../envelope";

describe("wrapEnvelope", () => {
  it("puts the version beside the value", () => {
    expect(wrapEnvelope(2, { id: "1" })).toEqual({ v: 2, d: { id: "1" } });
  });
});

describe("unwrapStored", () => {
  it("reads the version and the payload out of an envelope", () => {
    expect(unwrapStored({ v: 3, d: "x" })).toEqual({ version: 3, payload: "x" });
  });

  it("accepts an envelope whose payload is null", () => {
    expect(unwrapStored({ v: 1, d: null })).toEqual({ version: 1, payload: null });
  });

  it.each([
    ["a string", "dark"],
    ["a number", 7],
    ["null", null],
    ["an array", [1, 2]],
    ["an object with other fields", { compact: true }],
    ["an object with only v", { v: 1 }],
    ["an object with only d", { d: 1 }],
    ["a third field beside v and d", { v: 1, d: 2, e: 3 }],
    ["two fields, only one of them v", { v: 1, e: 3 }],
    ["two fields, only one of them d", { d: 1, e: 3 }],
    ["a zero version", { v: 0, d: 1 }],
    ["a negative version", { v: -1, d: 1 }],
    ["a fractional version", { v: 1.5, d: 1 }],
    ["a version too large to be exact", { v: 2 ** 53, d: 1 }],
    ["a version written as text", { v: "1", d: 1 }],
  ])("treats %s as a value from before the key had versions", (_label, stored) => {
    expect(unwrapStored(stored)).toEqual({ version: 1, payload: stored });
  });

  it("does not count inherited fields as the envelope's own", () => {
    const stored = Object.create({ v: 1, d: 2 }) as object;

    expect(unwrapStored(stored)).toEqual({ version: 1, payload: stored });
  });

  it("does not count fields on the prototype towards the pair", () => {
    const stored = Object.assign(Object.create({ d: 2 }) as object, { v: 1, e: 3 });

    expect(unwrapStored(stored).version).toBe(1);
    expect(unwrapStored(stored).payload).toBe(stored);
  });
});
