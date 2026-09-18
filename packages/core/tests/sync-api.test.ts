import { describe, expect, it } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageSchemaError,
  StorageValidationError,
} from "../src/index";
import { asyncStringSchema, countSchema, themeSchema } from "./fixtures/schemas";
import { asyncOnlyAdapter } from "./fakes/adapters";

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  count: { schema: countSchema },
});

describe("when the adapter can answer immediately", () => {
  it("exposes the synchronous half", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expect(typeof storage.getSync).toBe("function");
    expect(typeof storage.setSync).toBe("function");
    expect(typeof storage.removeSync).toBe("function");
    expect(typeof storage.hasSync).toBe("function");
    expect(typeof storage.clearSync).toBe("function");
  });

  it("round-trips without waiting", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    storage.setSync("theme", "dark");

    expect(storage.getSync("theme")).toBe("dark");
  });

  it("answers a missing key from the declared default, as the asynchronous half does", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expect(storage.getSync("theme")).toBe("light");
  });

  it("lets the schema answer for a missing key", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expect(storage.getSync("count")).toBe(0);
  });

  it("removes and reports presence", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    storage.setSync("theme", "dark");
    expect(storage.hasSync("theme")).toBe(true);

    storage.removeSync("theme");
    expect(storage.hasSync("theme")).toBe(false);
  });

  it("clears only the declared keys", () => {
    const adapter = memoryAdapter({ initial: { other: '"keep"' } });
    const storage = createStorage({ schema, adapter });

    storage.setSync("theme", "dark");
    storage.clearSync();

    expect(adapter.entries.get("other")).toBe('"keep"');
    expect(adapter.entries.has("theme")).toBe(false);
  });

  it("applies the same invalid-data policy", () => {
    const adapter = memoryAdapter({ initial: { theme: '"purple"' } });
    const storage = createStorage({ schema, adapter });

    expect(storage.getSync("theme")).toBe("light");
    expect(storage.getSync("theme", { onInvalid: () => "dark" })).toBe("dark");
    expect(() => storage.getSync("theme", { onInvalid: "throw" })).toThrow(StorageValidationError);
  });

  it("throws on a write the schema rejects, rather than returning a rejected promise", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expect(() => storage.setSync("theme", "purple" as never)).toThrow(StorageValidationError);
  });

  it("reads back what the other half wrote", async () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    await storage.set("theme", "dark");
    expect(storage.getSync("theme")).toBe("dark");

    storage.setSync("theme", "light");
    expect(await storage.get("theme")).toBe("light");
  });
});

describe("when the adapter cannot answer immediately", () => {
  it("does not expose the synchronous half at all", () => {
    const storage = createStorage({ schema, adapter: asyncOnlyAdapter });

    expect("getSync" in storage).toBe(false);
    expect("setSync" in storage).toBe(false);
    expect("clearSync" in storage).toBe(false);
  });

  it("still serves the asynchronous half", async () => {
    const storage = createStorage({ schema, adapter: asyncOnlyAdapter });

    expect(await storage.get("theme")).toBe("light");
  });
});

describe("a schema that validates asynchronously", () => {
  const asyncSchema = defineStorageSchema({ note: { schema: asyncStringSchema } });

  it("works on the asynchronous half", async () => {
    const storage = createStorage({ schema: asyncSchema, adapter: memoryAdapter() });

    await storage.set("note", "hello");

    expect(await storage.get("note")).toBe("hello");
  });

  it("refuses the synchronous half rather than handing back a promise as the value", () => {
    const storage = createStorage({ schema: asyncSchema, adapter: memoryAdapter() });

    expect(() => storage.getSync("note")).toThrow(StorageSchemaError);
  });

  it("says why it refused, with a code a caller can branch on", () => {
    const storage = createStorage({ schema: asyncSchema, adapter: memoryAdapter() });

    try {
      storage.getSync("note");
      expect.unreachable("the synchronous read should have thrown");
    } catch (error) {
      expect((error as StorageSchemaError).code).toBe(STORAGE_ERROR_CODE.AsyncValidatorInSyncMode);
      expect((error as StorageSchemaError).message).toContain("asynchronous");
    }
  });

  it("refuses a synchronous write for the same reason", () => {
    const storage = createStorage({ schema: asyncSchema, adapter: memoryAdapter() });

    expect(() => storage.setSync("note", "hello")).toThrow(StorageSchemaError);
  });
});

describe("an adapter that reports it can answer immediately but does not", () => {
  /*
    The engine's synchronous path is synchronous by construction, so this cannot happen through any adapter in this package. It is checked rather than asserted because the failure it prevents — a promise handed back as though it were the value — would be far harder to diagnose than the error below.
  */
  const lyingAdapter = {
    ...memoryAdapter(),
    getSync: () => Promise.resolve('"dark"') as unknown as string,
  };

  it("refuses the value rather than handing back a promise", () => {
    const storage = createStorage({ schema, adapter: lyingAdapter });

    expect(() => storage.getSync("theme")).toThrow(StorageSchemaError);
  });

  it("names the adapter that broke the promise", () => {
    const storage = createStorage({ schema, adapter: lyingAdapter });

    expect(() => storage.getSync("theme")).toThrow(
      /"memory" adapter reports that it answers immediately but did not/,
    );
  });
});

describe("a synchronous backend that throws", () => {
  it("wraps a foreign error the same way the asynchronous path does", () => {
    const adapter = {
      ...memoryAdapter(),
      getSync: (): string => {
        throw new Error("storage is gone");
      },
    };
    const storage = createStorage({ schema, adapter });

    expect(() => storage.getSync("theme")).toThrow(StorageAdapterError);
  });

  it("carries the original failure as the cause", () => {
    const cause = new Error("quota exceeded");
    const adapter = {
      ...memoryAdapter(),
      setSync: (): void => {
        throw cause;
      },
    };
    const storage = createStorage({ schema, adapter });

    try {
      storage.setSync("theme", "dark");
      expect.unreachable("the write should have thrown");
    } catch (error) {
      expect((error as StorageAdapterError).cause).toBe(cause);
      expect((error as StorageAdapterError).operation).toBe("set");
    }
  });
});
