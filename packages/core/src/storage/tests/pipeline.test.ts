import { describe, expect, it } from "vitest";

import { STORAGE_ERROR_CODE } from "../../errors/codes";
import { jsonSerializer } from "../../serializer/json-serializer";
import { passthroughSerializer } from "../../serializer/passthrough-serializer";
import type { KeyDefinition } from "../../schema/key-definition";
import type { Serializer } from "../../serializer/serializer";
import {
  asyncStringSchema,
  countSchema,
  themeSchema,
  userSchema,
} from "../../../tests/fixtures/schemas";
import { deserializeWire, resolveMissing, serializeValue, validateValue } from "../pipeline";
import type { EntryContext } from "../pipeline";

function entry(
  definition: KeyDefinition,
  serializer: Serializer<unknown> = jsonSerializer as Serializer<unknown>,
): EntryContext {
  return { key: "theme", physicalKey: "app:theme", definition, serializer };
}

describe("deserializeWire", () => {
  it("reports a backend holding nothing as missing, never as a stored null", () => {
    expect(deserializeWire(entry({ schema: themeSchema }), undefined)).toEqual({ kind: "missing" });
  });

  it("treats a stored null as a value, because a schema may legitimately hold one", () => {
    expect(deserializeWire(entry({ schema: themeSchema }), "null")).toEqual({
      kind: "deserialized",
      value: null,
    });
  });

  it("returns what the serializer produced", () => {
    expect(deserializeWire(entry({ schema: themeSchema }), '"dark"')).toEqual({
      kind: "deserialized",
      value: "dark",
    });
  });

  it("reports a failure rather than throwing it, and names both keys", () => {
    const result = deserializeWire(entry({ schema: themeSchema }), "{not json");

    expect(result.kind).toBe("invalid");

    if (result.kind !== "invalid") throw new Error("expected an invalid result");

    expect(result.error.code).toBe(STORAGE_ERROR_CODE.Serialization);
    expect(result.error.direction).toBe("deserialize");
    expect(result.error.key).toBe("theme");
    expect(result.error.physicalKey).toBe("app:theme");
    expect(result.error.raw).toBe("{not json");
    expect(result.error.message).toContain('"theme" (app:theme)');
    expect(result.error.cause).toBeInstanceOf(SyntaxError);
  });

  it("hands a JSON-value wire straight through", () => {
    const passthrough = passthroughSerializer as unknown as Serializer<unknown>;

    expect(deserializeWire(entry({ schema: userSchema }, passthrough), { id: "u1" })).toEqual({
      kind: "deserialized",
      value: { id: "u1" },
    });
  });
});

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
