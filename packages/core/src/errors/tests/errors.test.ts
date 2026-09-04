import { describe, expect, it } from "vitest";

import {
  ERROR_BRAND,
  formatIssues,
  isPlatformStorageError,
  isStorageValidationError,
  PlatformStorageError,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageSchemaError,
  StorageSerializationError,
  StorageUnavailableError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../../index";

const issue = { message: "expected one of light, dark" };

describe("error hierarchy", () => {
  it("gives every error a name matching its class, so a stack trace reads plainly", () => {
    expect(new PlatformStorageError(STORAGE_ERROR_CODE.Adapter, "x").name).toBe(
      "PlatformStorageError",
    );
    expect(new StorageSchemaError("x").name).toBe("StorageSchemaError");
    expect(new UnknownStorageKeyError({ key: "a", knownKeys: ["b"] }).name).toBe(
      "UnknownStorageKeyError",
    );
  });

  it("makes every error catchable as the base class", () => {
    const errors = [
      new StorageValidationError({
        key: "theme",
        physicalKey: "theme",
        operation: "get",
        issues: [issue],
        raw: "purple",
      }),
      new StorageSerializationError({
        key: "theme",
        physicalKey: "theme",
        direction: "deserialize",
        raw: "{",
      }),
      new StorageAdapterError({ adapter: "memory", operation: "set" }),
      new StorageSchemaError("bad schema"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(PlatformStorageError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("keeps the underlying failure as the cause", () => {
    const cause = new Error("QuotaExceededError");
    const error = new StorageAdapterError({ adapter: "web", operation: "set", cause });

    expect(error.cause).toBe(cause);
  });

  it("reports an unavailable backend as an adapter failure with its own code", () => {
    const error = new StorageUnavailableError({ adapter: "web", operation: "get" });

    expect(error).toBeInstanceOf(StorageAdapterError);
    expect(error.code).toBe(STORAGE_ERROR_CODE.Unavailable);
  });
});

describe("StorageValidationError", () => {
  it("carries the value that failed, so a caller can report or recover it", () => {
    const error = new StorageValidationError({
      key: "theme",
      physicalKey: "app:theme",
      operation: "get",
      issues: [issue],
      raw: "purple",
    });

    expect(error.raw).toBe("purple");
    expect(error.issues).toEqual([issue]);
    expect(error.code).toBe(STORAGE_ERROR_CODE.Validation);
  });

  it("names the physical key only when it differs from the key that was read", () => {
    const renamed = new StorageValidationError({
      key: "theme",
      physicalKey: "app:theme",
      operation: "get",
      issues: [issue],
      raw: "purple",
    });
    const same = new StorageValidationError({
      key: "theme",
      physicalKey: "theme",
      operation: "get",
      issues: [issue],
      raw: "purple",
    });

    expect(renamed.message).toContain('"theme" (app:theme)');
    expect(same.message).not.toContain("(");
  });

  it("says which direction failed, so a write is not mistaken for a read", () => {
    const write = new StorageValidationError({
      key: "theme",
      physicalKey: "theme",
      operation: "set",
      issues: [issue],
      raw: "purple",
    });

    expect(write.message).toContain("written to");
  });
});

describe("formatIssues", () => {
  it("joins the reasons a value was rejected", () => {
    expect(formatIssues([{ message: "too short" }, { message: "wrong case" }])).toBe(
      "too short; wrong case",
    );
  });

  it("prefixes the path of a nested failure", () => {
    expect(formatIssues([{ message: "expected a string", path: ["user", "name"] }])).toBe(
      "user.name: expected a string",
    );
  });

  it("reads a path segment given as an object, which the specification also permits", () => {
    expect(formatIssues([{ message: "required", path: [{ key: "user" }, { key: 0 }] }])).toBe(
      "user.0: required",
    );
  });

  it("renders a symbol segment rather than throwing on it", () => {
    expect(formatIssues([{ message: "required", path: [Symbol("secret")] }])).toBe(
      "secret: required",
    );
  });

  it("renders a symbol with no description rather than an empty segment", () => {
    expect(formatIssues([{ message: "required", path: [Symbol()] }])).toBe("Symbol(): required");
  });

  it("says something when a validator reports no reason at all", () => {
    expect(formatIssues([])).toBe("no reason given");
  });
});

describe("error guards", () => {
  it("recognizes this library's errors", () => {
    const error = new StorageValidationError({
      key: "theme",
      physicalKey: "theme",
      operation: "get",
      issues: [issue],
      raw: 1,
    });

    expect(isPlatformStorageError(error)).toBe(true);
    expect(isStorageValidationError(error)).toBe(true);
  });

  it("recognizes an error thrown by a second copy of this package, which instanceof cannot", () => {
    // What an error from a duplicate install looks like from here: same shape, different class.
    const foreign = {
      [ERROR_BRAND]: true,
      code: STORAGE_ERROR_CODE.Validation,
      message: "from another copy",
    };

    expect(foreign).not.toBeInstanceOf(PlatformStorageError);
    expect(isPlatformStorageError(foreign)).toBe(true);
    expect(isStorageValidationError(foreign)).toBe(true);
  });

  it("rejects anything that is not one of this library's errors", () => {
    expect(isPlatformStorageError(new Error("plain"))).toBe(false);
    expect(isPlatformStorageError(undefined)).toBe(false);
    expect(isPlatformStorageError(null)).toBe(false);
    expect(isPlatformStorageError("VALIDATION")).toBe(false);
  });

  it("rejects a branded object carrying a code this library does not define", () => {
    expect(isPlatformStorageError({ [ERROR_BRAND]: true, code: "SOMETHING_ELSE" })).toBe(false);
  });

  it("narrows to the validation error only for that code", () => {
    expect(
      isStorageValidationError(new StorageAdapterError({ adapter: "m", operation: "get" })),
    ).toBe(false);
  });
});
