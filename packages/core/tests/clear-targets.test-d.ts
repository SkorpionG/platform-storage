import * as z from "zod";
import { describe, expectTypeOf, it } from "vitest";

import { CLEAR_TARGET, createStorage, defineStorageSchema, memoryAdapter } from "../src/index";
import type { ClearTargets } from "../src/index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
});

describe("clear's targets", () => {
  it("takes nothing, one target, or a list", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expectTypeOf(storage.clear()).toEqualTypeOf<Promise<void>>();
    void storage.clear("everything");
    void storage.clear(CLEAR_TARGET.Undeclared);
    void storage.clear(["readFrom", "unprefixed"]);
    void storage.clear([]);
    storage.clearSync("declared");
    storage.clearSync(["declared", "undeclared"]);
    expectTypeOf(storage.clear).parameter(0).toEqualTypeOf<ClearTargets | undefined>();
    expectTypeOf(storage.clearSync).parameter(0).toEqualTypeOf<ClearTargets | undefined>();
  });

  it("refuses everything inside a list, and anything that is not a target", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    // @ts-expect-error "everything" has to be asked for on its own.
    void storage.clear(["everything"]);
    // @ts-expect-error "everything" has to be asked for on its own.
    void storage.clear(["declared", CLEAR_TARGET.Everything]);
    // @ts-expect-error "everything" has to be asked for on its own.
    storage.clearSync(["readFrom", "everything"]);
    // @ts-expect-error "all" is not a target.
    void storage.clear("all");
    // @ts-expect-error A key is not a target.
    void storage.clear(["theme"]);
  });

  it("refuses a list typed as every target, which could hold everything", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const targets = Object.values(CLEAR_TARGET);

    // @ts-expect-error The list's type allows "everything".
    void storage.clear(targets);
  });
});
