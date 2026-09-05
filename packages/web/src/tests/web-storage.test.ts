import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { defineStorageSchema, StorageValidationError } from "../index";
import {
  createLocalStorage,
  createSessionStorage,
  localStorageAdapter,
  sessionStorageAdapter,
} from "../web-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("localStorageAdapter and sessionStorageAdapter", () => {
  it("each write to their own storage and not the other", () => {
    localStorageAdapter().setSync("theme", '"dark"');
    sessionStorageAdapter().setSync("theme", '"light"');

    expect(localStorage.getItem("theme")).toBe('"dark"');
    expect(sessionStorage.getItem("theme")).toBe('"light"');
  });

  it("are named after the storage they reach, so an error says which one failed", () => {
    expect(localStorageAdapter().name).toBe("localStorage");
    expect(sessionStorageAdapter().name).toBe("sessionStorage");
    expect(localStorageAdapter({ name: "prefs" }).name).toBe("prefs");
    expect(sessionStorageAdapter({ name: "draft" }).name).toBe("draft");
  });

  it("report availability by probing the real storage", () => {
    expect(localStorageAdapter().isAvailable?.()).toBe(true);
    expect(sessionStorageAdapter().isAvailable?.()).toBe(true);
  });
});

describe("createLocalStorage", () => {
  it("round-trips through localStorage, storing JSON text under the physical key", async () => {
    const storage = createLocalStorage({ schema });

    await storage.set("user", { id: "u1", name: "Ada" });

    expect(localStorage.getItem("app:user")).toBe('{"id":"u1","name":"Ada"}');
    expect(await storage.get("user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("carries the synchronous half, so a first render can read without waiting", () => {
    const storage = createLocalStorage({ schema });

    storage.setSync("theme", "dark");

    expect(storage.getSync("theme")).toBe("dark");
    expect(storage.hasSync("theme")).toBe(true);
  });

  it("returns the default where nothing is stored", () => {
    expect(createLocalStorage({ schema }).getSync("theme")).toBe("light");
    expect(createLocalStorage({ schema }).getSync("user")).toBeUndefined();
  });

  it("clears only the keys the schema declares, never the rest of the origin", () => {
    localStorage.setItem("someone-elses-key", "keep me");
    const storage = createLocalStorage({ schema });

    storage.setSync("theme", "dark");
    storage.setSync("user", { id: "u1", name: "Ada" });
    storage.clearSync();

    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("someone-elses-key")).toBe("keep me");
  });

  it("passes the remaining options through to createStorage", async () => {
    localStorage.setItem("theme", '"purple"');
    const onError = vi.fn();
    const storage = createLocalStorage({ schema, onInvalid: "throw", onError });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("createSessionStorage", () => {
  it("round-trips through sessionStorage and leaves localStorage alone", async () => {
    const storage = createSessionStorage({ schema });

    await storage.set("theme", "dark");

    expect(sessionStorage.getItem("theme")).toBe('"dark"');
    expect(localStorage.getItem("theme")).toBeNull();
    expect(storage.getSync("theme")).toBe("dark");
  });

  it("is a storage of its own, so the same schema can back both without either seeing the other", () => {
    const local = createLocalStorage({ schema });
    const session = createSessionStorage({ schema });

    local.setSync("theme", "dark");

    expect(session.getSync("theme")).toBe("light");
  });
});
