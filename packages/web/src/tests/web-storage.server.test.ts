// @vitest-environment node

import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  memoryAdapter,
  StorageUnavailableError,
  withFallback,
} from "../index";
import { createLocalStorage, localStorageAdapter, sessionStorageAdapter } from "../web-storage";

/*
  This suite runs without a DOM on purpose: it is the server-rendering case, where `window` does not exist and the web adapters have to say so rather than reach for a storage the browser will never read.
*/

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
});

describe("where there is no window", () => {
  it("reports both web storages as unavailable", () => {
    expect(typeof window).toBe("undefined");

    expect(localStorageAdapter().isAvailable?.()).toBe(false);
    expect(sessionStorageAdapter().isAvailable?.()).toBe(false);
  });

  it("fails an operation with an unavailable error rather than a reference error", () => {
    expect(() => localStorageAdapter().getSync("theme")).toThrow(StorageUnavailableError);
    expect(() => sessionStorageAdapter().setSync("theme", '"dark"')).toThrow(
      StorageUnavailableError,
    );
    expect(() => createLocalStorage({ schema }).getSync("theme")).toThrow(StorageUnavailableError);
  });

  it("builds one storage that works here and in a browser, by falling back to memory", async () => {
    const storage = createStorage({
      schema,
      adapter: withFallback(localStorageAdapter(), memoryAdapter()),
    });

    await storage.set("theme", "dark");

    expect(await storage.get("theme")).toBe("dark");
    expect(storage.getSync("theme")).toBe("dark");
  });
});
