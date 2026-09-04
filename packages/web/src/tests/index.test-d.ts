import { describe, expectTypeOf, it } from "vitest";

import { isWebStorageAvailable, jsonSerializer } from "../index";
import type { Serializer } from "../index";

describe("@platform-storage/web entry point", () => {
  it("re-exports the core API, so an app installs one package", () => {
    expectTypeOf(jsonSerializer).toEqualTypeOf<Serializer<string>>();
  });

  it("takes the storage as a function, so the access itself can be guarded", () => {
    expectTypeOf(isWebStorageAvailable).parameter(0).toEqualTypeOf<() => Storage>();
    expectTypeOf(isWebStorageAvailable).returns.toEqualTypeOf<boolean>();
  });
});
