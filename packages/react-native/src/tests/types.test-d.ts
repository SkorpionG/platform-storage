import { describe, expectTypeOf, it } from "vitest";
import type { AsyncStorage } from "@react-native-async-storage/async-storage";

import type { AsyncStorageLike } from "../types";

/*
  The point of this file: `src` declares the AsyncStorage shape structurally so the native module never reaches a consumer's dependency graph. That only stays honest if the declaration still matches the real API, which is what the conformance assertion below checks.

  Written as a conditional type rather than `toExtend`, so the direction of the assignability check is unambiguous: the real storage must satisfy our interface, never the reverse.
*/
type Conforms<Storage> = Storage extends AsyncStorageLike ? true : false;

describe("AsyncStorageLike", () => {
  it("is satisfied by the real AsyncStorage", () => {
    expectTypeOf<Conforms<AsyncStorage>>().toEqualTypeOf<true>();
  });

  it("asks for only the three operations a key-value adapter needs", () => {
    expectTypeOf<keyof AsyncStorageLike>().toEqualTypeOf<"getItem" | "setItem" | "removeItem">();
  });
});
