import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { defineStorageSchema, StorageValidationError } from "../index";
import { createWebExtensionStorage } from "../web-extension-storage";
import { fakeStorageNamespace } from "../../tests/fakes/fake-web-extension-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebExtensionStorage", () => {
  it("round-trips through the local area by default, storing the value itself under the physical key", async () => {
    const namespace = fakeStorageNamespace();
    const storage = createWebExtensionStorage({ schema, storage: () => namespace });

    await storage.set("user", { id: "u1", name: "Ada" });

    expect(namespace.local.entries.get("app:user")).toEqual({ id: "u1", name: "Ada" });
    expect(await storage.get("user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("finds the browser's own API when no storage is given", async () => {
    const namespace = fakeStorageNamespace();
    vi.stubGlobal("browser", { storage: namespace });
    const storage = createWebExtensionStorage({ schema });

    await storage.set("theme", "dark");

    expect(namespace.local.entries.get("theme")).toBe("dark");
    expect(await storage.get("theme")).toBe("dark");
  });

  it("addresses another area when asked, so two areas are two storages over two schemas", async () => {
    const namespace = fakeStorageNamespace();
    const local = createWebExtensionStorage({ schema, storage: () => namespace });
    const synced = createWebExtensionStorage({ schema, storage: () => namespace, area: "sync" });

    await local.set("theme", "dark");

    expect(await synced.get("theme")).toBe("light");
    expect(namespace.sync.entries.size).toBe(0);
  });

  it("has no synchronous half, since an area only ever answers later", () => {
    const storage = createWebExtensionStorage({ schema, storage: () => fakeStorageNamespace() });

    expect("getSync" in storage).toBe(false);
  });

  it("returns the default where nothing is stored", async () => {
    const storage = createWebExtensionStorage({ schema, storage: () => fakeStorageNamespace() });

    expect(await storage.get("theme")).toBe("light");
    expect(await storage.get("user")).toBeUndefined();
  });

  it("clears only the keys the schema declares, never the rest of the area", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ "someone-elses-key": { keep: "me" } });
    const storage = createWebExtensionStorage({ schema, storage: () => namespace });

    await storage.set("theme", "dark");
    await storage.set("user", { id: "u1", name: "Ada" });
    await storage.clear();

    expect([...namespace.local.entries.keys()]).toEqual(["someone-elses-key"]);
  });

  /*
    An area holds JSON values, so nothing is encoded on the way in. That is what makes a value outside JSON dangerous here rather than merely wrong: the browser stores something else in its place and the loss shows up much later, as data that no longer matches its schema. The write is refused instead.
  */
  it("refuses a write the area could not hold, naming where in the value the problem is", async () => {
    const namespace = fakeStorageNamespace();
    const datedSchema = defineStorageSchema({
      profile: { schema: z.object({ id: z.string(), seenAt: z.date() }) },
    });
    const storage = createWebExtensionStorage({ schema: datedSchema, storage: () => namespace });

    await expect(storage.set("profile", { id: "u1", seenAt: new Date() })).rejects.toThrow(
      expect.objectContaining({
        code: "SERIALIZATION",
        direction: "serialize",
        key: "profile",
      }),
    );
    expect(namespace.local.entries.size).toBe(0);
  });

  it("reports the failure through onError and says which part of the value it was", async () => {
    const namespace = fakeStorageNamespace();
    const onError = vi.fn();
    const mapSchema = defineStorageSchema({ cache: { schema: z.custom<unknown>() } });
    const storage = createWebExtensionStorage({
      schema: mapSchema,
      storage: () => namespace,
      onError,
    });

    await expect(storage.set("cache", { entries: new Map() })).rejects.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(onError).mock.calls[0]?.[0].cause).toMatchObject({
      message: "`entries` is a Map, which is not a JSON value.",
    });
  });

  it("passes the remaining options through to createStorage", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ theme: "purple" });
    const onError = vi.fn();
    const storage = createWebExtensionStorage({
      schema,
      storage: () => namespace,
      onInvalid: "throw",
      onError,
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
