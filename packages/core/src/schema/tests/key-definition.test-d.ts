import { describe, expectTypeOf, it } from "vitest";

import type { GetResult, SetValue } from "../../index";
import type {
  countSchema,
  nicknameSchema,
  tagsSchema,
  themeCatchSchema,
  themeSchema,
  userSchema,
} from "../../../tests/fixtures/schemas";

interface User {
  id: string;
  name: string;
}

describe("GetResult", () => {
  it("admits undefined when nothing supplies a value for a missing key", () => {
    expectTypeOf<GetResult<{ readonly schema: typeof themeSchema }>>().toEqualTypeOf<
      "light" | "dark" | undefined
    >();
    expectTypeOf<GetResult<{ readonly schema: typeof userSchema }>>().toEqualTypeOf<
      User | undefined
    >();
  });

  it("drops undefined when the definition declares a default", () => {
    expectTypeOf<
      GetResult<{ readonly schema: typeof themeSchema; readonly default: "light" }>
    >().toEqualTypeOf<"light" | "dark">();
  });

  it("drops undefined when the schema itself supplies the value", () => {
    // `z.number().default(0)` accepts `undefined` as input and answers with 0.
    expectTypeOf<GetResult<{ readonly schema: typeof countSchema }>>().toEqualTypeOf<number>();
  });

  it("keeps undefined for a catch schema, which covers invalid data rather than missing data", () => {
    // `z.catch()` takes the value type as its input, so it never stands in for an absent key.
    expectTypeOf<GetResult<{ readonly schema: typeof themeCatchSchema }>>().toEqualTypeOf<
      "light" | "dark" | undefined
    >();
  });

  it("drops undefined when a catch schema is paired with a declared default", () => {
    expectTypeOf<
      GetResult<{ readonly schema: typeof themeCatchSchema; readonly default: "light" }>
    >().toEqualTypeOf<"light" | "dark">();
  });

  it("keeps undefined for an optional schema, because that is a value it returns", () => {
    expectTypeOf<GetResult<{ readonly schema: typeof nicknameSchema }>>().toEqualTypeOf<
      string | undefined
    >();
  });

  it("returns a mutable value even though a declared default is inferred readonly", () => {
    expectTypeOf<
      GetResult<{ readonly schema: typeof tagsSchema; readonly default: readonly [] }>
    >().toEqualTypeOf<Array<string>>();
  });

  it("degrades to admitting undefined when a definition only optionally has a default", () => {
    // A widened `KeyDefinition` cannot promise a default is there, so the result must allow its absence.
    expectTypeOf<
      GetResult<{ readonly schema: typeof themeSchema; readonly default?: "light" | "dark" }>
    >().toEqualTypeOf<"light" | "dark" | undefined>();
  });
});

describe("SetValue", () => {
  it("is the schema's output, so a write stores the normalized value", () => {
    expectTypeOf<SetValue<{ readonly schema: typeof themeSchema }>>().toEqualTypeOf<
      "light" | "dark"
    >();
    expectTypeOf<SetValue<{ readonly schema: typeof userSchema }>>().toEqualTypeOf<User>();
  });

  it("stays narrow for a schema whose input type would be unusably wide", () => {
    // `z.catch()` accepts `unknown` as input; taking that here would disable write-time checking.
    expectTypeOf<SetValue<{ readonly schema: typeof themeCatchSchema }>>().toEqualTypeOf<
      "light" | "dark"
    >();
    expectTypeOf<SetValue<{ readonly schema: typeof countSchema }>>().toEqualTypeOf<number>();
  });

  it("is unaffected by a declared default", () => {
    expectTypeOf<
      SetValue<{ readonly schema: typeof themeSchema; readonly default: "light" }>
    >().toEqualTypeOf<"light" | "dark">();
  });
});
