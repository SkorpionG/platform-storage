import { describe, expect, it } from "vitest";

import { defineStorageSchema, isStorageSchema, StorageSchemaError } from "../../index";
import { themeSchema, userSchema } from "../../../tests/fixtures/schemas";

describe("defineStorageSchema", () => {
  it("brands the result, so a storage can tell a schema from a plain object", () => {
    const schema = defineStorageSchema({ theme: { schema: themeSchema } });

    expect(isStorageSchema(schema)).toBe(true);
    expect(isStorageSchema({ theme: { schema: themeSchema } })).toBe(false);
  });

  it("keeps the keys in the order they were declared", () => {
    const schema = defineStorageSchema({
      theme: { schema: themeSchema },
      user: { schema: userSchema },
    });

    expect(schema.keys).toEqual(["theme", "user"]);
  });

  it("stores under the logical key when no physical key is given", () => {
    const schema = defineStorageSchema({ theme: { schema: themeSchema } });

    expect(schema.physicalKeys.theme).toBe("theme");
  });

  it("stores under the declared physical key, so a stored name can differ from the read name", () => {
    const schema = defineStorageSchema({ user: { schema: userSchema, key: "app:user" } });

    expect(schema.physicalKeys.user).toBe("app:user");
  });

  it("exposes the definition it was given, so a later layer can build on the same object", () => {
    const definition = { theme: { schema: themeSchema, default: "light" } } as const;
    const schema = defineStorageSchema(definition);

    expect(schema.definition).toBe(definition);
  });

  it("freezes the result, so a schema cannot be edited after a storage is built over it", () => {
    const schema = defineStorageSchema({ theme: { schema: themeSchema } });

    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema.keys)).toBe(true);
    expect(Object.isFrozen(schema.physicalKeys)).toBe(true);
  });

  it("rejects two keys that would store under one physical key", () => {
    expect(() =>
      defineStorageSchema({
        theme: { schema: themeSchema, key: "app:theme" },
        appearance: { schema: themeSchema, key: "app:theme" },
      }),
    ).toThrow(StorageSchemaError);
  });

  it("names both offenders when physical keys collide", () => {
    expect(() =>
      defineStorageSchema({
        theme: { schema: themeSchema, key: "app:theme" },
        appearance: { schema: themeSchema, key: "app:theme" },
      }),
    ).toThrow(/"theme" and "appearance" both store under "app:theme"/);
  });

  it("rejects a collision between a declared physical key and another key's logical name", () => {
    expect(() =>
      defineStorageSchema({
        theme: { schema: themeSchema },
        appearance: { schema: themeSchema, key: "theme" },
      }),
    ).toThrow(StorageSchemaError);
  });

  it("rejects an entry whose schema does not implement Standard Schema", () => {
    expect(() =>
      // Casting past the type error is the point: a JavaScript caller reaches this.
      defineStorageSchema({ theme: { schema: {} as never } }),
    ).toThrow(StorageSchemaError);
  });

  it("says which entry has no validator, rather than failing somewhere later", () => {
    expect(() => defineStorageSchema({ theme: { schema: {} as never } })).toThrow(
      /The "theme" entry has no Standard Schema validator/,
    );
  });

  it("rejects a validator whose Standard Schema marker is malformed", () => {
    const notAnObject = { "~standard": "yes" } as never;
    const wrongVersion = { "~standard": { version: 2, vendor: "someone" } } as never;
    const noVersion = { "~standard": { vendor: "someone" } } as never;
    const nullMarker = { "~standard": null } as never;

    for (const schema of [notAnObject, wrongVersion, noVersion, nullMarker]) {
      expect(() => defineStorageSchema({ theme: { schema } })).toThrow(StorageSchemaError);
    }
  });

  it("accepts an empty schema, which a storage with no declared keys legitimately has", () => {
    const schema = defineStorageSchema({});

    expect(schema.keys).toEqual([]);
  });
});
