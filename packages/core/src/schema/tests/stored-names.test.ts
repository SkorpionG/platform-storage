import { describe, expect, it } from "vitest";

import { defineStorageSchema, StorageSchemaError } from "../../index";
import { themeSchema, userSchema } from "../../../tests/fixtures/schemas";
import { checkStoredNames, resolveStoredNames } from "../stored-names";
import type { StoredNames } from "../stored-names";

const schema = defineStorageSchema({
  theme: { schema: themeSchema },
  user: { schema: userSchema, key: "u", readFrom: ["old"] },
  auth: { schema: userSchema, key: "vendor-token", readFrom: ["vendor-old"], prefixed: false },
});

function checking(names: Readonly<Record<string, StoredNames>>): () => void {
  return () => {
    checkStoredNames(Object.keys(names), (key) => names[key] as StoredNames);
  };
}

describe("resolveStoredNames", () => {
  it("leaves every name as declared without a prefix", () => {
    const names = resolveStoredNames(schema, undefined);

    expect(names.get("theme")).toEqual({ current: "theme", old: [] });
    expect(names.get("user")).toEqual({ current: "u", old: ["old"] });
    expect(names.get("auth")).toEqual({ current: "vendor-token", old: ["vendor-old"] });
  });

  it("puts the prefix before a key's name and its old names", () => {
    const names = resolveStoredNames(schema, "app:");

    expect(names.get("theme")).toEqual({ current: "app:theme", old: [] });
    expect(names.get("user")).toEqual({ current: "app:u", old: ["app:old"] });
  });

  it("leaves a key that opts out exactly as written", () => {
    expect(resolveStoredNames(schema, "app:").get("auth")).toEqual({
      current: "vendor-token",
      old: ["vendor-old"],
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
