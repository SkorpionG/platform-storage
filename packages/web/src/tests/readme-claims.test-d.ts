import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import { createLocalStorage, defineStorageSchema } from "../index";

/*
  The claims the root README makes with a `❌ Type error` comment, asserted here so a future change to the types cannot quietly make the README wrong.
*/
const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createLocalStorage({ schema });

describe("the README's type-error claims", () => {
  it("refuses a value outside the enum", () => {
    void storage.set("theme", "dark");
    // @ts-expect-error - "blue" is not one of the two the enum allows
    void storage.set("theme", "blue");
  });

  it("refuses a key the schema does not declare", () => {
    // @ts-expect-error - "them" is a typo, not a declared key
    void storage.get("them");
  });

  it("refuses an object missing a field", () => {
    // @ts-expect-error - `name` is missing
    void storage.set("user", { id: "u1" });
  });

  it("types a defaulted key without undefined, and an undefaulted one with it", async () => {
    expectTypeOf(await storage.get("theme")).toEqualTypeOf<"light" | "dark">();
    expectTypeOf(await storage.get("user")).toEqualTypeOf<
      { id: string; name: string } | undefined
    >();
    expectTypeOf(storage.getSync("theme")).toEqualTypeOf<"light" | "dark">();
  });
});
