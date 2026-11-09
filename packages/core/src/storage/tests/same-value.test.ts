import { describe, expect, it } from "vitest";

import { isSameValue } from "../same-value";

describe("isSameValue", () => {
  it.each([
    ["equal primitives", 1, 1],
    ["NaN", Number.NaN, Number.NaN],
    ["null", null, null],
    ["equal arrays", [1, [2]], [1, [2]]],
    ["plain objects with keys in another order", { a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }],
    ["objects with no prototype", Object.assign(Object.create(null) as object, { a: 1 }), { a: 1 }],
    ["dates at the same moment", new Date(5), new Date(5)],
    ["maps with the same entries", new Map([["a", { b: 1 }]]), new Map([["a", { b: 1 }]])],
    ["sets with the same members", new Set([1, "a"]), new Set(["a", 1])],
  ])("answers true for %s", (_label, first, second) => {
    expect(isSameValue(first, second)).toBe(true);
  });

  it.each([
    ["different primitives", 1, 2],
    ["a primitive and an object", 1, { a: 1 }],
    ["null and an object", null, {}],
    ["an object and null", {}, null],
    ["arrays of different lengths", [1], [1, 2]],
    ["arrays with a different element", [1, 2], [1, 3]],
    ["an array and an object", [], {}],
    ["an object and an array", {}, []],
    ["a date and its text", new Date(0), new Date(0).toISOString()],
    ["a date and an object", new Date(0), {}],
    ["dates at different moments", new Date(0), new Date(1)],
    ["a map and an empty object", new Map([["a", 1]]), {}],
    ["an object and a map", {}, new Map()],
    ["maps of different sizes", new Map([["a", 1]]), new Map()],
    ["maps with a different key", new Map([["a", 1]]), new Map([["b", 1]])],
    ["maps with a different value", new Map([["a", 1]]), new Map([["a", 2]])],
    ["a set and an empty object", new Set([1]), {}],
    ["an object and a set", {}, new Set()],
    ["sets of different sizes", new Set([1]), new Set()],
    ["sets with a different member", new Set([1]), new Set([2])],
    ["objects with different key counts", { a: 1 }, { a: 1, b: 2 }],
    ["objects with a different key", { a: 1 }, { b: 1 }],
    ["objects with a different value", { a: 1 }, { a: 2 }],
    [
      "instances of a class it cannot look inside",
      new URL("https://a.test"),
      new URL("https://a.test"),
    ],
    ["a class instance and a plain object", new URL("https://a.test"), {}],
  ])("answers false for %s", (_label, first, second) => {
    expect(isSameValue(first, second)).toBe(false);
  });

  it("compares every index of a sparse array, in either order", () => {
    // oxlint-disable-next-line unicorn/no-new-array
    const hole = new Array<unknown>(1);

    expect(isSameValue(hole, [7])).toBe(false);
    expect(isSameValue([7], hole)).toBe(false);
  });

  it("tells a hole from an explicit undefined", () => {
    // oxlint-disable-next-line unicorn/no-new-array
    const hole = new Array<unknown>(1);

    expect(isSameValue(hole, [undefined])).toBe(false);
    expect(isSameValue([undefined], hole)).toBe(false);
  });

  it("answers true for sparse arrays with the same holes and elements", () => {
    // oxlint-disable-next-line no-sparse-arrays
    expect(isSameValue([1, , 3], [1, , 3])).toBe(true);
  });

  it("answers false for sparse arrays differing in a populated element", () => {
    // oxlint-disable-next-line no-sparse-arrays
    expect(isSameValue([1, , 3], [1, , 4])).toBe(false);
  });

  it("answers true for the very same object, whatever it is", () => {
    const box = new URL("https://a.test");

    expect(isSameValue(box, box)).toBe(true);
  });
});
