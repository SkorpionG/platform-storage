import { describe, expect, it } from "vitest";

import { defineStorageSchema, StorageSchemaError } from "../../index";
import { themeSchema, userSchema } from "../../../tests/fixtures/schemas";
import { checkStoredNames, resolveStoredNames } from "../stored-names";
import type { ClaimedNames } from "../stored-names";

const schema = defineStorageSchema({
  theme: { schema: themeSchema },
  user: { schema: userSchema, key: "u", readFrom: ["old"] },
  auth: { schema: userSchema, key: "vendor-token", readFrom: ["vendor-old"], prefixed: false },
});

function checking(names: Readonly<Record<string, ClaimedNames>>): () => void {
  return () => {
    checkStoredNames(Object.keys(names), (key) => names[key] as ClaimedNames);
  };
}

describe("resolveStoredNames", () => {
  it("leaves every name as declared without a prefix", () => {
    const names = resolveStoredNames(schema, undefined);

    expect(names.get("theme")).toEqual({ current: "theme", old: [], readFrom: [], unprefixed: [] });
    expect(names.get("user")).toEqual({
      current: "u",
      old: ["old"],
      readFrom: ["old"],
      unprefixed: [],
    });
    expect(names.get("auth")).toEqual({
      current: "vendor-token",
      old: ["vendor-old"],
      readFrom: ["vendor-old"],
      unprefixed: [],
    });
  });

  it("puts the prefix before a key's name and its old names", () => {
    const names = resolveStoredNames(schema, "app:");

    expect(names.get("theme")).toMatchObject({ current: "app:theme", old: [] });
    expect(names.get("user")).toMatchObject({ current: "app:u", old: ["app:old"] });
  });

  it("keeps the names from before the prefix apart, so they can be cleared without being read", () => {
    const names = resolveStoredNames(schema, "app:");

    expect(names.get("user")).toEqual({
      current: "app:u",
      old: ["app:old"],
      readFrom: ["app:old"],
      unprefixed: ["u", "old"],
    });
  });

  it("reads the names from before the prefix after the prefixed ones, only when asked to", () => {
    expect(resolveStoredNames(schema, "app:", true).get("user")).toEqual({
      current: "app:u",
      old: ["app:old", "u", "old"],
      readFrom: ["app:old"],
      unprefixed: ["u", "old"],
    });
  });

  it("leaves a key that opts out exactly as written, with no names from before a prefix", () => {
    expect(resolveStoredNames(schema, "app:", true).get("auth")).toEqual({
      current: "vendor-token",
      old: ["vendor-old"],
      readFrom: ["vendor-old"],
      unprefixed: [],
    });
  });

  it("refuses names a prefix makes clash, which the schema alone could not see", () => {
    const clashing = defineStorageSchema({
      user: { schema: userSchema },
      raw: { schema: userSchema, key: "app:user", prefixed: false },
    });

    expect(() => resolveStoredNames(clashing, undefined)).not.toThrow();
    expect(() => resolveStoredNames(clashing, "app:")).toThrow(StorageSchemaError);
  });
});

describe("checkStoredNames", () => {
  it("accepts names that do not clash", () => {
    expect(
      checking({ a: { current: "a", old: ["x"] }, b: { current: "b", old: ["y"] } }),
    ).not.toThrow();
  });

  it("refuses two keys under one name", () => {
    expect(checking({ a: { current: "same", old: [] }, b: { current: "same", old: [] } })).toThrow(
      /"a" and "b" both store under "same"/,
    );
  });

  it("refuses an old name that is another key's current name, whichever is declared first", () => {
    expect(checking({ a: { current: "a", old: ["b"] }, b: { current: "b", old: [] } })).toThrow(
      /"a" reads from "b", which is where "b" stores/,
    );
    expect(checking({ b: { current: "b", old: [] }, a: { current: "a", old: ["b"] } })).toThrow(
      /"a" reads from "b"/,
    );
  });

  it("refuses two keys claiming one old name", () => {
    expect(checking({ a: { current: "a", old: ["x"] }, b: { current: "b", old: ["x"] } })).toThrow(
      /"a" and "b" both read from "x"/,
    );
  });

  it("lets one key list an old name twice", () => {
    expect(checking({ a: { current: "a", old: ["x", "x"] } })).not.toThrow();
  });
});
