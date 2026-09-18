import { describe, expect, it } from "vitest";

import { ERROR_BRAND, STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../codes";
import {
  PlatformStorageError,
  StorageAdapterError,
  StorageQuotaExceededError,
  StorageSchemaError,
  StorageSerializationError,
  StorageUnavailableError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../errors";
import { isPlatformStorageError, isStorageQuotaError, isStorageValidationError } from "../guards";

const validationError = new StorageValidationError({
  key: "theme",
  physicalKey: "theme",
  operation: STORAGE_OPERATION.Get,
  issues: [{ message: "nope" }],
  raw: "purple",
});

describe("isPlatformStorageError", () => {
  it("recognizes every error this library raises", () => {
    const errors = [
      new PlatformStorageError(STORAGE_ERROR_CODE.Adapter, "base"),
      validationError,
      new StorageSerializationError({
        key: "theme",
        physicalKey: "theme",
        direction: "deserialize",
        raw: "{",
      }),
      new StorageAdapterError({ adapter: "a", operation: STORAGE_OPERATION.Get }),
      new StorageQuotaExceededError({ adapter: "a", operation: STORAGE_OPERATION.Set }),
      new StorageUnavailableError({ adapter: "a", operation: STORAGE_OPERATION.Get }),
      new UnknownStorageKeyError({ key: "nope", knownKeys: ["theme"] }),
      new StorageSchemaError("bad"),
    ];

    for (const error of errors) expect(isPlatformStorageError(error)).toBe(true);
  });

  /*
    The reason the guard reads a brand rather than using `instanceof`: an application resolving two copies of this package holds two copies of each class, and React's serialization across a Server Components boundary replaces the error with a plain object entirely. Both survive a property.
  */
  it("recognizes a plain object carrying the brand and a known code", () => {
    expect(
      isPlatformStorageError({ [ERROR_BRAND]: true, code: STORAGE_ERROR_CODE.Validation }),
    ).toBe(true);
  });

  it("refuses an error this library did not raise", () => {
    expect(isPlatformStorageError(new Error("plain"))).toBe(false);
    expect(isPlatformStorageError(new TypeError("plain"))).toBe(false);
  });

  it("refuses a value that is not an object at all", () => {
    expect(isPlatformStorageError(null)).toBe(false);
    expect(isPlatformStorageError(undefined)).toBe(false);
    expect(isPlatformStorageError("VALIDATION")).toBe(false);
    expect(isPlatformStorageError(0)).toBe(false);
  });

  it("refuses an object carrying the brand but no recognizable code", () => {
    expect(isPlatformStorageError({ [ERROR_BRAND]: true, code: "MADE_UP" })).toBe(false);
    expect(isPlatformStorageError({ [ERROR_BRAND]: true })).toBe(false);
    expect(isPlatformStorageError({ [ERROR_BRAND]: true, code: 1 })).toBe(false);
  });

  it("refuses an object carrying a known code but no brand, which anything could have", () => {
    expect(isPlatformStorageError({ code: STORAGE_ERROR_CODE.Validation })).toBe(false);
  });

  it("refuses a brand that is not exactly true", () => {
    expect(
      isPlatformStorageError({ [ERROR_BRAND]: "yes", code: STORAGE_ERROR_CODE.Validation }),
    ).toBe(false);
  });
});

describe("isStorageQuotaError", () => {
  it("recognizes a backend that ran out of room", () => {
    expect(
      isStorageQuotaError(
        new StorageQuotaExceededError({ adapter: "localStorage", operation: "set" }),
      ),
    ).toBe(true);
  });

  /* The distinction a caller acts on: evicting something and retrying helps for one and not the other. */
  it("refuses a backend that failed for another reason", () => {
    expect(isStorageQuotaError(new StorageAdapterError({ adapter: "a", operation: "set" }))).toBe(
      false,
    );
    expect(
      isStorageQuotaError(new StorageUnavailableError({ adapter: "a", operation: "set" })),
    ).toBe(false);
  });

  it("refuses anything this library did not raise", () => {
    expect(isStorageQuotaError(new Error("QuotaExceededError"))).toBe(false);
    expect(isStorageQuotaError(null)).toBe(false);
  });
});

describe("isStorageValidationError", () => {
  it("recognizes a validation failure, which carries the issues and the value that failed", () => {
    expect(isStorageValidationError(validationError)).toBe(true);
  });

  it("refuses another of this library's errors", () => {
    expect(
      isStorageValidationError(new StorageAdapterError({ adapter: "a", operation: "get" })),
    ).toBe(false);
    expect(isStorageValidationError(new StorageSchemaError("bad"))).toBe(false);
  });

  it("refuses anything this library did not raise", () => {
    expect(isStorageValidationError(new Error("plain"))).toBe(false);
    expect(isStorageValidationError(null)).toBe(false);
  });
});
