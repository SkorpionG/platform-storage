import * as z from "zod";
import { describe, expect, it } from "vitest";

import { STORAGE_ERROR_CODE } from "../../errors/codes";
import { jsonSerializer } from "../../serializer/json-serializer";
import { passthroughSerializer } from "../../serializer/passthrough-serializer";
import type { KeyDefinition } from "../../schema/key-definition";
import type { Serializer } from "../../serializer/serializer";
import {
  asyncStringSchema,
  countSchema,
  nullableNameSchema,
  themeSchema,
  userSchema,
} from "../../../tests/fixtures/schemas";
import { decodeWire, isSameWire, resolveMissing, serializeValue, validateValue } from "../pipeline";
import type { EntryContext } from "../pipeline";

function entry(
  definition: KeyDefinition,
  serializer: Serializer<unknown> = jsonSerializer as Serializer<unknown>,
): EntryContext {
  return { key: "theme", physicalKey: "app:theme", definition, serializer };
}

describe("serializeValue", () => {
  it("returns the wire the serializer produced", () => {
    expect(serializeValue(entry({ schema: themeSchema }), "dark")).toEqual({
      kind: "serialized",
      wire: '"dark"',
    });
  });

  it("reports a value the serializer cannot represent, rather than throwing", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const result = serializeValue(entry({ schema: userSchema }), circular);

    expect(result.kind).toBe("invalid");

    if (result.kind !== "invalid") throw new Error("expected an invalid result");

    expect(result.error.code).toBe(STORAGE_ERROR_CODE.Serialization);
    expect(result.error.direction).toBe("serialize");
    expect(result.error.raw).toBe(circular);
    expect(result.error.message).toContain("Serializing the value for");
  });
});

function up(previous: { id: string }): { id: string; name: string } {
  return { ...previous, name: "N" };
}

describe("a versioned key", () => {
  const v1 = z.object({ id: z.string() });
  const v2 = z.object({ id: z.string(), name: z.string() });
  const definition: KeyDefinition = { schema: v2, versions: [{ schema: v1 }, { schema: v2, up }] };

  it("wraps what it serializes with the latest version", () => {
    expect(serializeValue(entry(definition), { id: "1", name: "N" })).toEqual({
      kind: "serialized",
      wire: '{"v":2,"d":{"id":"1","name":"N"}}',
    });
  });

  it("says a value brought forward is behind", () => {
    expect(decodeWire(entry(definition), '{"id":"1"}', "sync")).toEqual({
      kind: "valid",
      value: { id: "1", name: "N" },
      behind: true,
    });
  });

  it("says a value at the latest version is not behind", () => {
    expect(decodeWire(entry(definition), '{"v":2,"d":{"id":"1","name":"N"}}', "sync")).toEqual({
      kind: "valid",
      value: { id: "1", name: "N" },
      behind: false,
    });
  });

  it("reports a version ahead of the latest as newer, keeping only the payload", () => {
    const decoded = decodeWire(entry(definition), '{"v":3,"d":"x"}', "sync");

    expect(decoded).toMatchObject({
      kind: "newer",
      raw: "x",
      error: { code: STORAGE_ERROR_CODE.UnknownVersion, storedVersion: 3, latestVersion: 2 },
    });
  });

  it("validates against the version claimed, not the latest", () => {
    const decoded = decodeWire(entry(definition), '{"v":1,"d":{"nope":1}}', "sync");

    expect(decoded).toMatchObject({
      kind: "invalid",
      raw: { nope: 1 },
      error: { code: STORAGE_ERROR_CODE.Validation },
    });
  });
});

describe("validateValue", () => {
  it("reports a value the schema accepts, with the output the schema produced", () => {
    expect(validateValue(countSchema, undefined, "async")).toEqual({ kind: "valid", value: 0 });
  });

  it("reports the issues a schema raised", () => {
    const result = validateValue(themeSchema, "purple", "sync");

    expect(result).toMatchObject({ kind: "invalid" });

    if (!("issues" in result)) throw new Error("expected an invalid result");

    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("waits for a validator that answers later, on the asynchronous path", async () => {
    await expect(validateValue(asyncStringSchema, "hi", "async")).resolves.toEqual({
      kind: "valid",
      value: "hi",
    });
  });

  it("refuses a validator that answers later on the synchronous path, rather than leaking a promise", () => {
    expect(() => validateValue(asyncStringSchema, "hi", "sync")).toThrow(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.AsyncValidatorInSyncMode }),
    );
  });
});

describe("resolveMissing", () => {
  it("prefers the declared default", () => {
    expect(resolveMissing(entry({ schema: themeSchema, default: "dark" }), "sync")).toBe("dark");
  });

  it("returns the declared default as it was given, rather than a copy", () => {
    const value = { id: "u1", name: "Ada" };

    expect(resolveMissing(entry({ schema: userSchema, default: value }), "sync")).toBe(value);
  });

  it("lets the schema answer for itself when no default is declared", () => {
    expect(resolveMissing(entry({ schema: countSchema }), "sync")).toBe(0);
  });

  it("answers with undefined when neither can", () => {
    expect(resolveMissing(entry({ schema: themeSchema }), "sync")).toBeUndefined();
  });

  it("waits for a schema that answers later, rather than refusing on the asynchronous path", async () => {
    await expect(
      resolveMissing(entry({ schema: asyncStringSchema }), "async"),
    ).resolves.toBeUndefined();
  });
});

describe("decodeWire", () => {
  it("reports a backend holding nothing as missing", () => {
    expect(decodeWire(entry({ schema: themeSchema }), undefined, "sync")).toEqual({
      kind: "missing",
    });
  });

  it("answers with the validated value", () => {
    expect(decodeWire(entry({ schema: themeSchema }), '"dark"', "sync")).toEqual({
      kind: "valid",
      value: "dark",
      behind: false,
    });
  });

  it("treats a stored null as a value, because a schema may legitimately hold one", () => {
    expect(decodeWire(entry({ schema: nullableNameSchema }), "null", "sync")).toEqual({
      kind: "valid",
      value: null,
      behind: false,
    });
  });

  it("hands a JSON-value wire straight through", () => {
    const passthrough = passthroughSerializer as unknown as Serializer<unknown>;
    const user = { id: "u1", name: "Ada" };

    expect(decodeWire(entry({ schema: userSchema }, passthrough), user, "sync")).toEqual({
      kind: "valid",
      value: user,
      behind: false,
    });
  });

  it("reports text that cannot be deserialized, naming both keys and carrying the wire as it was", () => {
    const result = decodeWire(entry({ schema: themeSchema }), "{not json", "sync");

    expect(result).toMatchObject({
      kind: "invalid",
      raw: "{not json",
      error: {
        code: STORAGE_ERROR_CODE.Serialization,
        direction: "deserialize",
        key: "theme",
        physicalKey: "app:theme",
        raw: "{not json",
        message: expect.stringContaining('"theme" (app:theme)'),
        cause: expect.any(SyntaxError),
      },
    });
  });

  it("reports a value the schema refuses, carrying the value rather than the wire", () => {
    expect(decodeWire(entry({ schema: themeSchema }), '"mauve"', "sync")).toMatchObject({
      kind: "invalid",
      error: { code: STORAGE_ERROR_CODE.Validation, physicalKey: "app:theme", operation: "get" },
      raw: "mauve",
    });
  });

  it("waits for a validator that answers later", async () => {
    await expect(decodeWire(entry({ schema: asyncStringSchema }), '"a"', "async")).resolves.toEqual(
      { kind: "valid", value: "a", behind: false },
    );
  });
});

describe("isSameWire", () => {
  it("matches the same text", () => {
    expect(isSameWire('"a"', '"a"')).toBe(true);
  });

  it("matches equal objects, since a backend hands back a new one on every read", () => {
    expect(isSameWire({ a: [1] }, { a: [1] })).toBe(true);
  });

  it("tells different values apart", () => {
    expect(isSameWire({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("ignores the order of an object's keys, which a backend may change", () => {
    expect(isSameWire({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it("does not ignore the order of an array", () => {
    expect(isSameWire([1, 2], [2, 1])).toBe(false);
  });

  it("treats a value it cannot compare as different, which leaves the stored data alone", () => {
    expect(isSameWire({ a: 1n }, { a: 1n })).toBe(false);
  });
});
