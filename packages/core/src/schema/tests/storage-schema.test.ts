import { describe, expect, it } from "vitest";

import { themeSchema } from "../../../tests/fixtures/schemas";
import { defineStorageSchema } from "../define-storage-schema";
import { isStorageSchema, SCHEMA_BRAND } from "../storage-schema";

const schema = defineStorageSchema({ theme: { schema: themeSchema } });

describe("isStorageSchema", () => {
  it("recognizes what defineStorageSchema produced", () => {
    expect(isStorageSchema(schema)).toBe(true);
  });

  /* The brand is what makes a checked schema distinguishable, since a plain object literal has the same shape. */
  it("refuses a plain object of the same shape", () => {
    expect(
      isStorageSchema({
        definition: { theme: { schema: themeSchema } },
        keys: ["theme"],
        physicalKeys: { theme: "theme" },
      }),
    ).toBe(false);
  });

  it("refuses a value that is not an object at all", () => {
    expect(isStorageSchema(null)).toBe(false);
    expect(isStorageSchema(undefined)).toBe(false);
    expect(isStorageSchema("schema")).toBe(false);
    expect(isStorageSchema(0)).toBe(false);
  });

  it("refuses a brand that is not an object", () => {
    expect(isStorageSchema({ [SCHEMA_BRAND]: true })).toBe(false);
    expect(isStorageSchema({ [SCHEMA_BRAND]: null })).toBe(false);
  });

  it("refuses a brand marking something else, so two branded shapes cannot be confused", () => {
    expect(isStorageSchema({ [SCHEMA_BRAND]: { kind: "key", version: 1 } })).toBe(false);
    expect(isStorageSchema({ [SCHEMA_BRAND]: { version: 1 } })).toBe(false);
    expect(isStorageSchema({ [SCHEMA_BRAND]: {} })).toBe(false);
  });

  it("refuses a brand from a version this build does not know", () => {
    expect(isStorageSchema({ [SCHEMA_BRAND]: { kind: "schema", version: 2 } })).toBe(false);
    expect(isStorageSchema({ [SCHEMA_BRAND]: { kind: "schema" } })).toBe(false);
  });
});

describe("the schema object", () => {
  it("carries the brand it is recognized by", () => {
    expect(schema[SCHEMA_BRAND]).toEqual({ kind: "schema", version: 1 });
  });

  it("is frozen, so what was checked at declaration stays true", () => {
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema.keys)).toBe(true);
    expect(Object.isFrozen(schema.physicalKeys)).toBe(true);
    expect(Object.isFrozen(schema[SCHEMA_BRAND])).toBe(true);
  });
});
