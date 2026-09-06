import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { defineStorageSchema, StorageValidationError } from "../index";
import { createReactNativeStorage } from "../react-native-storage";
import { fakeAsyncStorage } from "../../tests/fakes/fake-async-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

describe("createReactNativeStorage", () => {
  it("round-trips through the storage it is given, storing JSON text under the physical key", async () => {
    const asyncStorage = fakeAsyncStorage();
    const storage = createReactNativeStorage({ schema, asyncStorage });

    await storage.set("user", { id: "u1", name: "Ada" });

    expect(asyncStorage.entries.get("app:user")).toBe('{"id":"u1","name":"Ada"}');
    expect(await storage.get("user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("has no synchronous half, since AsyncStorage only ever answers later", () => {
    const storage = createReactNativeStorage({ schema, asyncStorage: fakeAsyncStorage() });

    expect("getSync" in storage).toBe(false);
  });

  it("returns the default where nothing is stored", async () => {
    const storage = createReactNativeStorage({ schema, asyncStorage: fakeAsyncStorage() });

    expect(await storage.get("theme")).toBe("light");
    expect(await storage.get("user")).toBeUndefined();
  });

  it("clears only the keys the schema declares, never the rest of the storage", async () => {
    const asyncStorage = fakeAsyncStorage({ "someone-elses-key": '"keep me"' });
    const storage = createReactNativeStorage({ schema, asyncStorage });

    await storage.set("theme", "dark");
    await storage.set("user", { id: "u1", name: "Ada" });
    await storage.clear();

    expect([...asyncStorage.entries.keys()]).toEqual(["someone-elses-key"]);
  });

  it("passes the remaining options through to createStorage", async () => {
    const onError = vi.fn();
    const storage = createReactNativeStorage({
      schema,
      asyncStorage: fakeAsyncStorage({ theme: '"purple"' }),
      name: "device",
      onInvalid: "throw",
      onError,
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(storage.adapter.name).toBe("device");
  });
});
