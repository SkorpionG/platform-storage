import { describe, expectTypeOf, it } from "vitest";

import { jsonSerializer } from "../index";
import type { AsyncStorageLike, Serializer } from "../index";

describe("@platform-storage/react-native entry point", () => {
  it("re-exports the core API, so an app installs one package", () => {
    expectTypeOf(jsonSerializer).toEqualTypeOf<Serializer<string>>();
  });

  it("reads a missing key as null, matching AsyncStorage rather than the core API", () => {
    // The adapter maps this to `undefined`; the seam is deliberately here.
    expectTypeOf<AsyncStorageLike["getItem"]>().returns.toEqualTypeOf<Promise<string | null>>();
  });
});
