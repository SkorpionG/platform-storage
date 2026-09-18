import { describe, expect, it } from "vitest";

import { jsonSerializer } from "../json-serializer";

describe("jsonSerializer", () => {
  it("round-trips a JSON-compatible value", () => {
    const value = { id: "u1", tags: ["a", "b"], active: true, score: 1.5 };

    expect(jsonSerializer.deserialize(jsonSerializer.serialize(value))).toEqual(value);
  });

  it("preserves null rather than collapsing it to a missing value", () => {
    expect(jsonSerializer.deserialize(jsonSerializer.serialize(null))).toBeNull();
  });

  it("throws when deserializing text that is not JSON", () => {
    // The engine catches this and reports it against the key it happened on.
    expect(() => jsonSerializer.deserialize("{not json")).toThrow();
  });

  it("throws when serializing a value JSON cannot represent", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    expect(() => jsonSerializer.serialize(circular)).toThrow();
  });
});
