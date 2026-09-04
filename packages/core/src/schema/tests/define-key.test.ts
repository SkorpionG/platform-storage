import { describe, expect, it } from "vitest";

import { defineKey, defineStorageSchema } from "../../index";
import type { KeyOptions } from "../../index";
import { themeSchema, userSchema } from "../../../tests/fixtures/schemas";

describe("defineKey", () => {
  it("puts the schema and the options into one entry a schema can hold", () => {
    const theme = defineKey(themeSchema, { default: "light" });

    expect(theme.schema).toBe(themeSchema);
    expect(theme.default).toBe("light");
  });

  it("declares a key with no options at all", () => {
    const theme = defineKey(themeSchema);

    expect(theme.schema).toBe(themeSchema);
  });

  it("carries every option through to the composed schema", () => {
    const schema = defineStorageSchema({
      user: defineKey(userSchema, { key: "app:user" }),
      theme: defineKey(themeSchema, { default: "light", onInvalid: "remove" }),
    });

    expect(schema.physicalKeys.user).toBe("app:user");
    expect(schema.physicalKeys.theme).toBe("theme");
    expect(schema.definition.theme.onInvalid).toBe("remove");
  });

  it("keeps the schema even when an options object carries one of its own", () => {
    // `KeyOptions` has no `schema`, so reaching this needs a cast. The positional schema is the one every option was checked against, so the spread has to leave it in place.
    const smuggled = { schema: userSchema } as unknown as KeyOptions<typeof themeSchema>;
    const entry = defineKey(themeSchema, smuggled);

    expect(entry.schema).toBe(themeSchema);
  });

  it("composes with keys declared inline in the same schema", () => {
    const schema = defineStorageSchema({
      theme: defineKey(themeSchema, { default: "light" }),
      user: { schema: userSchema },
    });

    expect(schema.keys).toEqual(["theme", "user"]);
  });
});
