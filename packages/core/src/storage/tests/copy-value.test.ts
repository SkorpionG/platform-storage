import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { copyValue } from "../copy-value";

function noop(): void {}

describe("copyValue", () => {
  it("preserves primitives, including values JSON cannot represent", () => {
    for (const value of [undefined, null, true, "dark", 1n, Number.NaN, Infinity, Symbol("key")]) {
      expect(copyValue(value)).toBe(value);
    }
  });

  it("detaches nested objects and arrays while keeping repeated references together", () => {
    const nested = { tags: ["a"] };
    const original = { first: nested, second: nested };
    const copied = copyValue(original);

    copied.first.tags.push("b");

    expect(original.first.tags).toEqual(["a"]);
    expect(copied.first).toBe(copied.second);
    expect(copied.first).not.toBe(nested);
  });

  it("preserves cycles", () => {
    const original: { self?: object } = {};
    original.self = original;

    const copied = copyValue(original);

    expect(copied.self).toBe(copied);
    expect(copied).not.toBe(original);
  });

  it("detaches dates", () => {
    const original = { when: new Date("2020-01-01") };
    const copied = copyValue(original);

    copied.when.setUTCFullYear(2025);

    expect(original.when.getUTCFullYear()).toBe(2020);
  });

  it("copies map keys and set members as part of the same graph", () => {
    const key = { tags: ["a"] };
    const map = new Map<unknown, unknown>();
    const set = new Set<unknown>([key, map]);
    map.set(key, set);

    const copied = copyValue({ key, map, set });
    copied.key.tags.push("b");

    expect(copied.map.get(copied.key)).toBe(copied.set);
    expect(copied.set.has(copied.key)).toBe(true);
    expect(copied.set.has(copied.map)).toBe(true);
    expect(key.tags).toEqual(["a"]);
  });

  it("keeps sparse arrays and undefined properties", () => {
    const sparse: Array<string> = [];
    sparse.length = 3;
    sparse[2] = "a";

    const copied = copyValue({ sparse, absent: undefined });

    expect(copied.sparse).toHaveLength(3);
    expect(0 in copied.sparse).toBe(false);
    expect(copied.sparse[2]).toBe("a");
    expect(Object.hasOwn(copied, "absent")).toBe(true);
  });

  it("makes frozen defaults mutable without changing their property names", () => {
    const original = Object.freeze({ nested: Object.freeze({ a: 1 }) });
    const copied = copyValue(original);

    Object.assign(copied.nested, { a: 2 });

    expect(copied.nested.a).toBe(2);
    expect(original.nested.a).toBe(1);
  });

  it("keeps null prototypes and copies special property names safely", () => {
    const original = Object.assign(Object.create(null) as Record<string, unknown>, {
      ["__proto__"]: { safe: true },
    });

    const copied = copyValue(original);

    expect(Object.getPrototypeOf(copied)).toBeNull();
    expect(copied["__proto__"]).toEqual({ safe: true });
    expect(copied["__proto__"]).not.toBe(original["__proto__"]);
  });

  it("copies a stored __proto__ key as data, leaving the copy's prototype alone", () => {
    const original = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const copied = copyValue(original);

    expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
    expect(Object.hasOwn(copied, "__proto__")).toBe(true);
    expect((copied as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("recognizes plain data and built-ins from another realm", () => {
    const foreign = runInNewContext(
      '({ tags: ["a"], when: new Date(0), map: new Map([["k", ["v"]]]), set: new Set([["m"]]) })',
    ) as {
      tags: Array<string>;
      when: Date;
      map: Map<string, Array<string>>;
      set: Set<Array<string>>;
    };

    const copied = copyValue(foreign);

    expect(copied).not.toBe(foreign);
    expect(copied.tags).not.toBe(foreign.tags);
    expect(copied.when).not.toBe(foreign.when);
    expect(copied.map.get("k")).not.toBe(foreign.map.get("k"));
    expect(copied.when.getTime()).toBe(0);
  });

  it("hands back what it cannot copy, rather than refusing it", () => {
    class Money {
      readonly cents: number;

      constructor(cents: number) {
        this.cents = cents;
      }
    }
    class Tags extends Map<string, string> {}

    const money = new Money(1);
    const bytes = new Uint8Array(1);
    const custom = Object.create({ method: () => "custom" }) as object;
    const subclass = new Tags();
    const copied = copyValue({ money, fn: noop, bytes, custom, subclass });

    expect(copied.money).toBe(money);
    expect(copied.fn).toBe(noop);
    expect(copied.bytes).toBe(bytes);
    expect(copied.custom).toBe(custom);
    expect(copied.subclass).toBe(subclass);
  });

  it("keeps a value it cannot copy in the same place when it appears twice", () => {
    const bytes = new Uint8Array(1);
    const copied = copyValue({ first: bytes, second: bytes });

    expect(copied.first).toBe(copied.second);
  });

  it("does not mistake an object claiming a built-in's tag for one", () => {
    const pretender = Object.create({ [Symbol.toStringTag]: "Map" }) as object;

    expect(copyValue(pretender)).toBe(pretender);
  });
});
