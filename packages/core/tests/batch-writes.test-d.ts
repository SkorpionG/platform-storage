import * as z from "zod";
import { describe, expectTypeOf, it } from "vitest";

import { createStorage, defineStorageSchema, memoryAdapter } from "../src/index";
import type { SetManyValues } from "../src/index";
import { asyncOnlyAdapter } from "./fakes/adapters";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  nickname: { schema: z.string().optional() },
});

describe("setMany and removeMany's types", () => {
  it("takes any of the declared keys, each with a value its schema accepts", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    void storage.setMany({ theme: "dark" });
    void storage.setMany({ theme: "dark", nickname: undefined });
    expectTypeOf<SetManyValues<typeof schema.definition>>().toEqualTypeOf<{
      readonly theme?: "light" | "dark";
      readonly nickname?: string | undefined;
    }>();
  });

  it("refuses a wrong value or an undeclared key", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    // @ts-expect-error "neon" is not a theme.
    void storage.setMany({ theme: "neon" });
    // @ts-expect-error "nope" is not one of the declared keys.
    void storage.setMany({ nope: 1 });
    // @ts-expect-error "nope" is not one of the declared keys.
    void storage.removeMany(["theme", "nope"]);
  });

  it("has no synchronous versions over a backend that only answers later", () => {
    const storage = createStorage({ schema, adapter: asyncOnlyAdapter });

    expectTypeOf(storage).not.toHaveProperty("setManySync");
    expectTypeOf(storage).not.toHaveProperty("removeManySync");
  });
});
