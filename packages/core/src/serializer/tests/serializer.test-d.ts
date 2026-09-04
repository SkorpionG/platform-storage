import { describe, expectTypeOf, it } from "vitest";

import { jsonSerializer, passthroughSerializer } from "../../index";
import type { JsonValue, Serializer } from "../../index";

describe("Serializer", () => {
  it("pins each built-in serializer to the wire type its backends transport", () => {
    expectTypeOf(jsonSerializer).toEqualTypeOf<Serializer<string>>();
    expectTypeOf(passthroughSerializer).toEqualTypeOf<Serializer<JsonValue>>();
  });

  it("accepts any value to serialize and returns the wire type", () => {
    expectTypeOf(jsonSerializer.serialize).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(jsonSerializer.serialize).returns.toEqualTypeOf<string>();
  });

  it("returns unknown from deserialize, so a value must be validated before use", () => {
    expectTypeOf(jsonSerializer.deserialize).returns.toEqualTypeOf<unknown>();
  });
});
