import { describe, expect, it } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  hasFallback,
  isSyncStorageAdapter,
  jsonSerializer,
  memoryAdapter,
  passthroughSerializer,
  StorageSchemaError,
  StorageUnavailableError,
  withFallback,
} from "../src/index";
import type { PlatformStorageError, Serializer } from "../src/index";
import { themeSchema, userSchema } from "./fixtures/schemas";
import { areaAdapter, asyncOnlyAdapter, unavailableAdapter } from "./fakes/adapters";

const ada = { id: "1", name: "Ada" };

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  user: { schema: userSchema },
});

describe("withFallback to memory", () => {
  it("builds memory that answers immediately where the primary does, with the primary's serializer", () => {
    const adapter = withFallback(unavailableAdapter(), "memory");

    expect(isSyncStorageAdapter(adapter)).toBe(true);
    expect(adapter.serializer).toBe(jsonSerializer);

    adapter.setSync("theme", '"dark"');

    expect(adapter.getSync("theme")).toBe('"dark"');
    expect(adapter.chosen()).toBe("fallback");
    expect(adapter.name).toBe("unavailable (falling back to memory)");
  });

  it("holds JSON values where the primary does, as an extension area does", async () => {
    const adapter = withFallback({ ...areaAdapter(), isAvailable: () => false }, "memory");

    expect(adapter.serializer).toBe(passthroughSerializer);

    await adapter.set("user", { id: "1", name: "Ada" });

    expect(await adapter.get("user")).toEqual({ id: "1", name: "Ada" });
  });

  it("leaves the primary in use where it is available", () => {
    const primary = memoryAdapter({ name: "primary" });
    const adapter = withFallback(primary, "memory");

    adapter.setSync("theme", '"dark"');

    expect(primary.entries.get("theme")).toBe('"dark"');
    expect(adapter.chosen()).toBe("primary");
  });
});

describe("createStorage with a fallback", () => {
  it("answers from the fallback where the adapter is not available", () => {
    const storage = createStorage({ schema, adapter: unavailableAdapter(), fallback: "memory" });

    storage.setSync("user", ada);

    expect(storage.getSync("user")).toEqual(ada);
    expect(hasFallback(storage.adapter) && storage.adapter.chosen()).toBe("fallback");
  });

  it("uses the adapter where it is available, and an adapter given as the fallback otherwise", () => {
    const primary = memoryAdapter({ name: "primary" });
    const spare = memoryAdapter({ name: "spare" });
    const available = createStorage({ schema, adapter: primary, fallback: spare });
    const missing = createStorage({ schema, adapter: unavailableAdapter(), fallback: spare });

    available.setSync("theme", "dark");
    missing.setSync("theme", "light");

    expect(primary.entries.get("theme")).toBe('"dark"');
    expect(spare.entries.get("theme")).toBe('"light"');
  });

  it("carries the synchronous half only when both halves answer immediately", () => {
    const both = createStorage({ schema, adapter: memoryAdapter(), fallback: "memory" });
    const oneLater = createStorage({
      schema,
      adapter: unavailableAdapter(),
      fallback: asyncOnlyAdapter,
    });

    expect("getSync" in both).toBe(true);
    expect("getSync" in oneLater).toBe(false);
  });

  it("holds JSON values in memory built for text, since the storage serializes with the primary's serializer", async () => {
    const storage = createStorage({
      schema,
      adapter: { ...areaAdapter(), isAvailable: () => false },
      fallback: memoryAdapter(),
    });

    await storage.set("user", ada);

    expect(await storage.get("user")).toEqual(ada);
  });

  it("applies the prefix to whichever half it chose", () => {
    const spare = memoryAdapter({ name: "spare" });
    const storage = createStorage({
      schema,
      adapter: unavailableAdapter(),
      fallback: spare,
      prefix: "app:",
    });

    storage.setSync("theme", "dark");

    expect([...spare.entries.keys()]).toEqual(["app:theme"]);
  });

  it("leaves the adapter alone when no fallback is given", () => {
    const adapter = unavailableAdapter();
    const storage = createStorage({ schema, adapter });

    expect(storage.adapter).toBe(adapter);
    expect(hasFallback(storage.adapter)).toBe(false);
  });
});

describe("a fallback given from outside the types", () => {
  it.each([
    ["null", null],
    ["an unknown name", "disk"],
    ["an object that is not an adapter", { get: () => undefined }],
  ])("refuses %s when the storage is built, reporting it", (_, fallback) => {
    const errors: Array<PlatformStorageError> = [];

    expect(() =>
      createStorage({
        schema,
        adapter: memoryAdapter(),
        fallback: fallback as never,
        onError: (error) => {
          errors.push(error);
        },
      }),
    ).toThrow(StorageSchemaError);
    expect(errors).toHaveLength(1);
  });
});

describe("a fallback beside other options", () => {
  it("serializes with the storage's serializer whichever half it chose", () => {
    const tagged: Serializer<string> = {
      serialize: (value) => `tagged:${JSON.stringify(value)}`,
      deserialize: (wire) => JSON.parse(wire.slice("tagged:".length)) as unknown,
    };
    const spare = memoryAdapter({ name: "spare" });
    const storage = createStorage({
      schema,
      adapter: unavailableAdapter(),
      fallback: spare,
      serializer: tagged,
    });

    storage.setSync("theme", "dark");

    expect(spare.entries.get("theme")).toBe('tagged:"dark"');
    expect(storage.getSync("theme")).toBe("dark");
  });

  it("reports the fallback as unavailable where neither half is there", () => {
    const storage = createStorage({
      schema,
      adapter: unavailableAdapter("first"),
      fallback: {
        ...asyncOnlyAdapter,
        name: "second",
        isAvailable: () => false,
        get: () =>
          Promise.reject(new StorageUnavailableError({ adapter: "second", operation: "get" })),
      },
      onError: () => undefined,
    });

    return expect(storage.get("theme")).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

describe("hasFallback", () => {
  it("recognizes a pairing and nothing else", () => {
    expect(hasFallback(withFallback(memoryAdapter(), "memory"))).toBe(true);
    expect(hasFallback(memoryAdapter())).toBe(false);
    expect(hasFallback({ ...memoryAdapter(), chosen: "primary" } as never)).toBe(false);
  });
});
