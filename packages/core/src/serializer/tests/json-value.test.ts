import { describe, expect, it } from "vitest";

import { findNonJsonValue } from "../json-value";

describe("values a JSON backend can hold", () => {
  it("accepts every JSON primitive", () => {
    for (const value of ["", "text", 0, -1, 1.5, true, false, null]) {
      expect(findNonJsonValue(value)).toBeUndefined();
    }
  });

  it("accepts arrays and plain objects, however deeply nested", () => {
    expect(findNonJsonValue([])).toBeUndefined();
    expect(findNonJsonValue({})).toBeUndefined();
    expect(
      findNonJsonValue({ user: { id: "u1", tags: ["a", { nested: [1, null, true] }] } }),
    ).toBeUndefined();
  });

  it("accepts an object with no prototype, which is still a plain record", () => {
    const bare: Record<string, unknown> = Object.create(null);
    bare["id"] = "u1";

    expect(findNonJsonValue(bare)).toBeUndefined();
  });

  /* JSON drops such a property rather than corrupting it, and it is how an optional field is ordinarily written. */
  it("accepts an object property holding undefined, a function or a symbol", () => {
    expect(findNonJsonValue({ nickname: undefined })).toBeUndefined();
    expect(findNonJsonValue({ run: () => undefined })).toBeUndefined();
    expect(findNonJsonValue({ tag: Symbol("tag") })).toBeUndefined();
  });

  /* One object reached twice is not a cycle, and JSON writes it out both times. */
  it("accepts the same object appearing twice in one tree", () => {
    const shared = { id: "u1" };

    expect(findNonJsonValue({ author: shared, editor: shared })).toBeUndefined();
    expect(findNonJsonValue([shared, shared])).toBeUndefined();
  });
});

describe("values it cannot", () => {
  it("rejects a Date, which a backend would store as something else entirely", () => {
    expect(findNonJsonValue(new Date())).toBe("The value is a Date, which is not a JSON value.");
  });

  it("rejects the collections that would come back as empty objects", () => {
    expect(findNonJsonValue(new Map())).toContain("a Map");
    expect(findNonJsonValue(new Set())).toContain("a Set");
  });

  it("rejects a class instance, since only a plain record survives", () => {
    class User {
      readonly id = "u1";
    }

    expect(findNonJsonValue(new User())).toBe("The value is a User, which is not a JSON value.");
  });

  /* An object whose prototype chain carries no constructor gives the message nothing to call it, so it has to say so rather than print `undefined`. */
  it("still rejects an object it cannot name", () => {
    const nameless: object = Object.create(Object.create(null) as object);

    expect(findNonJsonValue(nameless)).toBe(
      "The value is an object of an unknown kind, which is not a JSON value.",
    );
  });

  it("rejects the numbers that have no JSON form and would be stored as null", () => {
    expect(findNonJsonValue(Number.NaN)).toBe("The value is NaN, which is not a JSON value.");
    expect(findNonJsonValue(Number.POSITIVE_INFINITY)).toContain("Infinity");
    expect(findNonJsonValue(Number.NEGATIVE_INFINITY)).toContain("-Infinity");
  });

  it("rejects the primitives JSON has no representation for", () => {
    expect(findNonJsonValue(undefined)).toBe("The value is undefined, which is not a JSON value.");
    expect(findNonJsonValue(10n)).toContain("a bigint");
    expect(findNonJsonValue(Symbol("tag"))).toContain("a symbol");
    expect(findNonJsonValue(() => undefined)).toContain("a function");
  });

  /* Unlike an object, an array cannot drop an element: JSON writes `null` in its place and the list changes shape. */
  it("rejects undefined, a function or a symbol inside an array", () => {
    expect(findNonJsonValue(["a", undefined])).toBe(
      "`[1]` is undefined, which is not a JSON value.",
    );
    expect(findNonJsonValue([() => undefined])).toContain("`[0]`");
    expect(findNonJsonValue([Symbol("tag")])).toContain("`[0]`");
  });

  it("rejects a hole in a sparse array, which reads back as null", () => {
    const sparse = ["a", "b", "c"];
    delete sparse[1];

    expect(findNonJsonValue(sparse)).toContain("`[1]`");
  });

  it("names where the problem is, so a nested one can be found", () => {
    expect(findNonJsonValue({ user: { createdAt: new Date() } })).toBe(
      "`user.createdAt` is a Date, which is not a JSON value.",
    );
    expect(findNonJsonValue({ users: [{ seen: new Set() }] })).toBe(
      "`users[0].seen` is a Set, which is not a JSON value.",
    );
  });

  it("reports the first problem it meets and stops there", () => {
    expect(findNonJsonValue({ a: new Date(), b: new Map() })).toContain("`a`");
  });

  it("rejects a cycle rather than following it forever", () => {
    const circular: Record<string, unknown> = { id: "u1" };
    circular["self"] = circular;

    expect(findNonJsonValue(circular)).toBe(
      "`self` is a circular reference, which is not a JSON value.",
    );
  });

  it("rejects a cycle through an array too", () => {
    const list: Array<unknown> = [];
    list.push(list);

    expect(findNonJsonValue(list)).toBe(
      "`[0]` is a circular reference, which is not a JSON value.",
    );
  });
});
