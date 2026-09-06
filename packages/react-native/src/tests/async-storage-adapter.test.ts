import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  isSyncStorageAdapter,
  jsonSerializer,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageValidationError,
} from "../index";
import { asyncStorageAdapter } from "../async-storage-adapter";
import { fakeAsyncStorage, rejectingAsyncStorage } from "../../tests/fakes/fake-async-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  nullableName: { schema: z.string().nullable() },
});

describe("asyncStorageAdapter", () => {
  it("answers only asynchronously, so a storage over it has no synchronous half", () => {
    expect(isSyncStorageAdapter(asyncStorageAdapter(fakeAsyncStorage()))).toBe(false);
  });

  it("transports JSON text, since AsyncStorage holds only strings", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).serializer).toBe(jsonSerializer);
  });

  it("writes to and reads from the storage it is given", async () => {
    const storage = fakeAsyncStorage();
    const adapter = asyncStorageAdapter(storage);

    await adapter.set("theme", '"dark"');

    expect(storage.entries.get("theme")).toBe('"dark"');
    expect(await adapter.get("theme")).toBe('"dark"');
  });

  it("reports a missing key as undefined, where AsyncStorage itself says null", async () => {
    expect(await asyncStorageAdapter(fakeAsyncStorage()).get("absent")).toBeUndefined();
  });

  it("removes a key", async () => {
    const storage = fakeAsyncStorage({ theme: '"dark"' });
    const adapter = asyncStorageAdapter(storage);

    await adapter.remove("theme");

    expect(storage.entries.has("theme")).toBe(false);
  });

  it("takes a name, which errors then report", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).name).toBe("AsyncStorage");
    expect(asyncStorageAdapter(fakeAsyncStorage(), { name: "device" }).name).toBe("device");
  });
});

describe("a storage that rejects", () => {
  it("becomes an adapter error through a storage, keeping the rejection as the cause", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(rejectingAsyncStorage("disk full")),
    });

    await expect(storage.set("theme", "dark")).rejects.toThrow(StorageAdapterError);
    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
      adapter: "AsyncStorage",
      operation: "set",
      physicalKey: "theme",
      cause: expect.objectContaining({ message: "disk full" }),
    });
  });

  it("is never softened by the invalid-data policy, which governs values rather than backends", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(rejectingAsyncStorage("disk full")),
      onInvalid: "fallback",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageAdapterError);
  });
});

describe("through a storage", () => {
  it("keeps a stored null apart from a key that holds nothing", async () => {
    const storage = createStorage({ schema, adapter: asyncStorageAdapter(fakeAsyncStorage()) });

    await storage.set("nullableName", null);

    expect(await storage.get("nullableName")).toBeNull();
    expect(await storage.has("nullableName")).toBe(true);

    await storage.remove("nullableName");

    expect(await storage.get("nullableName")).toBeUndefined();
    expect(await storage.has("nullableName")).toBe(false);
  });

  it("falls back when what is stored no longer matches the schema", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(fakeAsyncStorage({ theme: '"purple"' })),
    });

    expect(await storage.get("theme")).toBe("light");
  });

  it("falls back when what is stored is not JSON at all, as a value written by other code may not be", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(fakeAsyncStorage({ theme: "dark" })),
    });

    expect(await storage.get("theme")).toBe("light");
  });

  it("throws instead where the storage asks it to", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(fakeAsyncStorage({ theme: '"purple"' })),
      onInvalid: "throw",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
  });
});
