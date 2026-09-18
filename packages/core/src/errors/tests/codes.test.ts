import { describe, expect, it } from "vitest";

import { ERROR_BRAND, STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../codes";

/*
  These values are the public contract. A consumer branches on a code and reads a brand off a caught value, so changing one silently breaks code this library cannot see. Pinning the exact sets here makes any change a deliberate one with a failing test in front of it.
*/

describe("STORAGE_ERROR_CODE", () => {
  it("names exactly the failures this library reports", () => {
    expect(STORAGE_ERROR_CODE).toEqual({
      Validation: "VALIDATION",
      Serialization: "SERIALIZATION",
      Adapter: "ADAPTER",
      Quota: "QUOTA",
      Unavailable: "UNAVAILABLE",
      UnknownKey: "UNKNOWN_KEY",
      InvalidSchema: "INVALID_SCHEMA",
      AsyncValidatorInSyncMode: "ASYNC_VALIDATOR_IN_SYNC_MODE",
    });
  });

  it("gives each failure a code of its own, so branching on one is unambiguous", () => {
    const codes = Object.values(STORAGE_ERROR_CODE);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("STORAGE_OPERATION", () => {
  it("names exactly the operations a storage performs", () => {
    expect(STORAGE_OPERATION).toEqual({
      Get: "get",
      Set: "set",
      Remove: "remove",
      Has: "has",
      Clear: "clear",
    });
  });

  it("gives each operation a name of its own", () => {
    const operations = Object.values(STORAGE_OPERATION);

    expect(new Set(operations).size).toBe(operations.length);
  });
});

describe("ERROR_BRAND", () => {
  it("is the property a caught value carries, readable across two copies of the package", () => {
    expect(ERROR_BRAND).toBe("~platformStorageError");
  });
});
