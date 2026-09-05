import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { defineStorageSchema, StorageValidationError } from "../index";
import { createExtensionStorage } from "../extension-storage";
import { fakeStorageNamespace } from "../../tests/fakes/fake-extension-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createExtensionStorage", () => {
  it("round-trips through the local area by default, storing the value itself under the physical key", async () => {
    const namespace = fakeStorageNamespace();
    const storage = createExtensionStorage({ schema, storage: () => namespace });

    await storage.set("user", { id: "u1", name: "Ada" });

    expect(namespace.local.entries.get("app:user")).toEqual({ id: "u1", name: "Ada" });
    expect(await storage.get("user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("finds the browser's own API when no storage is given", async () => {
    const namespace = fakeStorageNamespace();
    vi.stubGlobal("browser", { storage: namespace });
    const storage = createExtensionStorage({ schema });

    await storage.set("theme", "dark");

    expect(namespace.local.entries.get("theme")).toBe("dark");
    expect(await storage.get("theme")).toBe("dark");
  });

  it("addresses another area when asked, so two areas are two storages over two schemas", async () => {
    const namespace = fakeStorageNamespace();
    const local = createExtensionStorage({ schema, storage: () => namespace });
    const synced = createExtensionStorage({ schema, storage: () => namespace, area: "sync" });

    await local.set("theme", "dark");

    expect(await synced.get("theme")).toBe("light");
    expect(namespace.sync.entries.size).toBe(0);
  });

  it("has no synchronous half, since an area only ever answers later", () => {
    const storage = createExtensionStorage({ schema, storage: () => fakeStorageNamespace() });

    expect("getSync" in storage).toBe(false);
  });

  it("returns the default where nothing is stored", async () => {
    const storage = createExtensionStorage({ schema, storage: () => fakeStorageNamespace() });

    expect(await storage.get("theme")).toBe("light");
    expect(await storage.get("user")).toBeUndefined();
  });

  it("clears only the keys the schema declares, never the rest of the area", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ "someone-elses-key": { keep: "me" } });
    const storage = createExtensionStorage({ schema, storage: () => namespace });

    await storage.set("theme", "dark");
    await storage.set("user", { id: "u1", name: "Ada" });
    await storage.clear();

    expect([...namespace.local.entries.keys()]).toEqual(["someone-elses-key"]);
  });

  it("passes the remaining options through to createStorage", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ theme: "purple" });
    const onError = vi.fn();
    const storage = createExtensionStorage({
      schema,
      storage: () => namespace,
      onInvalid: "throw",
      onError,
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
