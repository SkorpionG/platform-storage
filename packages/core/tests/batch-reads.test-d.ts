import * as z from "zod";
import { describe, expectTypeOf, it } from "vitest";

import { createStorage, defineStorageSchema, memoryAdapter } from "../src/index";
import type { GetManyResult } from "../src/index";
import { asyncOnlyAdapter } from "./fakes/adapters";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string() }) },
});

type Definition = typeof schema.definition;

describe("getMany's types", () => {
  it("keys the answer by exactly the keys asked for, each typed as get would answer", async () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expectTypeOf(await storage.getMany(["theme", "user"])).toEqualTypeOf<
      GetManyResult<Definition, "theme" | "user">
    >();
    expectTypeOf(await storage.getMany(["theme"])).toEqualTypeOf<{
      readonly theme: "light" | "dark";
    }>();
    expectTypeOf(storage.getManySync(["user"])).toEqualTypeOf<{
      readonly user: { id: string } | undefined;
    }>();
  });

  it("refuses a key the schema does not declare", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    // @ts-expect-error "nope" is not one of the declared keys.
    void storage.getMany(["theme", "nope"]);
  });

  it("takes a named policy, but not a callback typed against one key", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    void storage.getMany(["theme"], { onInvalid: "throw" });
    // @ts-expect-error A callback is typed against one key, and these keys hold different things.
    void storage.getMany(["theme"], { onInvalid: () => "light" });
  });

  it("has no synchronous version over a backend that only answers later", () => {
    const storage = createStorage({ schema, adapter: asyncOnlyAdapter });

    expectTypeOf(storage).not.toHaveProperty("getManySync");
  });
});
