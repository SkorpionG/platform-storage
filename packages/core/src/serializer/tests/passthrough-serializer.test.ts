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
});
