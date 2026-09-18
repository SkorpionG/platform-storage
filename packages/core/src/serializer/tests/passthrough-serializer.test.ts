import { describe, expect, it } from "vitest";

import { passthroughSerializer } from "../passthrough-serializer";

describe("passthroughSerializer", () => {
  it("hands the value over untouched so the backend stores an object, not a string", () => {
    const value = { theme: "dark" };

    expect(passthroughSerializer.serialize(value)).toBe(value);
  });

  it("returns the stored value unchanged", () => {
    const wire = { theme: "dark" };

    expect(passthroughSerializer.deserialize(wire)).toBe(wire);
  });

  /*
    Nothing downstream would report these. The value is handed over as it is, so a backend that cannot hold one stores something else in its place and the loss surfaces much later, as data that no longer matches its schema. The engine turns this throw into a `StorageSerializationError` naming the key.
  */
  it("refuses a value no JSON backend could hold", () => {
    expect(() => passthroughSerializer.serialize(new Date())).toThrow(TypeError);
    expect(() => passthroughSerializer.serialize(new Map())).toThrow(TypeError);
    expect(() => passthroughSerializer.serialize(Number.NaN)).toThrow(TypeError);
  });

  it("says which part of the value it could not hold", () => {
    expect(() => passthroughSerializer.serialize({ user: { seenAt: new Date() } })).toThrow(
      "`user.seenAt` is a Date, which is not a JSON value.",
    );
  });

  it("refuses a cycle rather than handing one to a backend that would reject it obscurely", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    expect(() => passthroughSerializer.serialize(circular)).toThrow("a circular reference");
  });

  it("accepts every value a JSON backend can hold, including a stored null", () => {
    for (const value of ["text", 0, true, null, [1, "a", null], { a: { b: [true] } }]) {
      expect(passthroughSerializer.serialize(value)).toBe(value);
    }
  });
});
