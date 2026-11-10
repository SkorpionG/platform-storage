import * as z from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineKey,
  defineStorageSchema,
  defineSyncAdapter,
  defineVersions,
  jsonSerializer,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../src/index";
import type { PlatformStorageError } from "../src/index";
import { batchingAdapter, gate, recordingAdapter } from "./fakes/adapters";
import { themeSchema, userSchema } from "./fixtures/schemas";

const ada = { id: "1", name: "Ada" };
const stored = (value: unknown): string => JSON.stringify(value);

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  user: { schema: userSchema, key: "u", readFrom: ["old-user"] },
  nickname: { schema: z.string().optional() },
});

describe("getMany", () => {
  it("answers each key as get would, defaults included", async () => {
    const storage = createStorage({
      schema,
      adapter: batchingAdapter({ u: stored(ada) }),
    });

    expect(await storage.getMany(["theme", "user", "nickname"])).toEqual({
      theme: "light",
      user: ada,
      nickname: undefined,
    });
  });

  it("reaches the backend in one call for all of its keys, old names included", async () => {
    const adapter = batchingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema, adapter });

    await storage.getMany(["theme", "user", "nickname"]);

    expect(adapter.calls).toEqual(["getMany theme,u,old-user,nickname"]);
  });

  it("reaches each name in turn on a backend with no batch call, with the same answer", async () => {
    const adapter = recordingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema, adapter });

    expect(await storage.getMany(["theme", "nickname"])).toEqual({
      theme: "dark",
      nickname: undefined,
    });
    expect(adapter.calls).toEqual(["get theme", "get nickname"]);
  });

  it("reads a key listed twice once", async () => {
    const adapter = batchingAdapter({ layout: '{"compact":true}' });
    const up = vi.fn((previous: { compact: boolean }) => ({
      density: previous.compact ? ("compact" as const) : ("comfortable" as const),
    }));
    const storage = createStorage({
      schema: defineStorageSchema({
        layout: defineVersions(z.object({ compact: z.boolean() })).next(
          z.object({ density: z.enum(["compact", "comfortable"]) }),
          up,
        ),
      }),
      adapter,
    });

    expect(await storage.getMany(["layout", "layout"])).toEqual({
      layout: { density: "compact" },
    });
    expect(adapter.calls[0]).toBe("getMany layout");
    expect(up).toHaveBeenCalledOnce();
  });

  it("answers an empty list with an empty object and no backend call", async () => {
    const adapter = batchingAdapter();
    const storage = createStorage({ schema, adapter });

    expect(await storage.getMany([])).toEqual({});
    expect(adapter.calls).toEqual([]);
  });

  it("throws for an undeclared key before reading anything, and reports it", async () => {
    const errors: Array<PlatformStorageError> = [];
    const adapter = batchingAdapter();
    const storage = createStorage({
      schema,
      adapter,
      onError: (error) => {
        errors.push(error);
      },
    });

    await expect(storage.getMany(["theme", "nope" as "theme"])).rejects.toBeInstanceOf(
      UnknownStorageKeyError,
    );
    expect(adapter.calls).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("moves a value found under an old name, as get does", async () => {
    const adapter = batchingAdapter({ "old-user": stored(ada) });
    const storage = createStorage({ schema, adapter });

    expect(await storage.getMany(["user"])).toEqual({ user: ada });
    expect(Object.fromEntries(adapter.entries)).toEqual({ u: stored(ada) });
  });

  it("migrates a versioned key and saves the latest version", async () => {
    const adapter = batchingAdapter({ layout: '{"compact":true}' });
    const storage = createStorage({
      schema: defineStorageSchema({
        layout: defineVersions(z.object({ compact: z.boolean() })).next(
          z.object({ density: z.enum(["compact", "comfortable"]) }),
          (previous) => ({ density: previous.compact ? "compact" : "comfortable" }),
        ),
      }),
      adapter,
    });

    expect(await storage.getMany(["layout"])).toEqual({ layout: { density: "compact" } });
    expect(adapter.entries.get("layout")).toBe('{"v":2,"d":{"density":"compact"}}');
  });

  it("saves what recover repaired", async () => {
    const adapter = batchingAdapter({ theme: "DARK" });
    const storage = createStorage({
      schema: defineStorageSchema({
        theme: defineKey(themeSchema, { recover: (raw) => (raw === "DARK" ? "dark" : undefined) }),
      }),
      adapter,
    });

    expect(await storage.getMany(["theme"])).toEqual({ theme: "dark" });
    expect(adapter.entries.get("theme")).toBe('"dark"');
  });

  it("reads under the storage's prefix, bare names too when it adopts one", async () => {
    const adapter = batchingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema, adapter, prefix: "app:", readUnprefixed: true });

    expect(await storage.getMany(["theme"])).toEqual({ theme: "dark" });
    expect(adapter.calls[0]).toBe("getMany app:theme,theme");
    expect(Object.fromEntries(adapter.entries)).toEqual({ "app:theme": '"dark"' });
  });

  it("applies a per-call policy to every key", async () => {
    const adapter = batchingAdapter({ theme: '"neon"', nickname: "7" });
    const storage = createStorage({ schema, adapter });

    await expect(storage.getMany(["theme"], { onInvalid: "throw" })).rejects.toBeInstanceOf(
      StorageValidationError,
    );

    expect(await storage.getMany(["theme", "nickname"], { onInvalid: "remove" })).toEqual({
      theme: "light",
      nickname: undefined,
    });
    expect(adapter.entries.size).toBe(0);
  });

  it("waits for writes already started on any of its keys", async () => {
    const landing = gate();
    const base = batchingAdapter();
    const storage = createStorage({
      schema,
      adapter: {
        ...base,
        set: (key: string, value: string) => landing.opened.then(() => base.set(key, value)),
      },
    });

    const writing = storage.set("theme", "dark");
    const reading = storage.getMany(["theme"]);

    await Promise.resolve();
    landing.open();
    await writing;

    expect(await reading).toEqual({ theme: "dark" });
  });

  it("re-checks the live backend before a repair, not what the batch read found", async () => {
    const paused = gate();
    let first = true;
    const adapter = batchingAdapter({ "old-user": stored(ada) }, (call) => {
      if (!call.startsWith("getMany") || !first) return undefined;

      first = false;

      return paused.opened;
    });
    const storage = createStorage({ schema, adapter });

    const reading = storage.getMany(["user"]);

    await vi.waitFor(() => {
      expect(adapter.calls).toContain("getMany u,old-user");
    });
    await storage.set("user", { id: "2", name: "Newer" });
    paused.open();

    expect(await reading).toEqual({ user: ada });
    expect(adapter.entries.get("u")).toBe(stored({ id: "2", name: "Newer" }));
  });

  it("reports a failed batch read once, naming the batch operation", async () => {
    const errors: Array<PlatformStorageError> = [];
    const storage = createStorage({
      schema,
      adapter: { ...batchingAdapter(), getMany: () => Promise.reject(new Error("refused")) },
      onError: (error) => {
        errors.push(error);
      },
    });

    await expect(storage.getMany(["theme"])).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
      operation: "getMany",
    });
    expect(errors).toHaveLength(1);
  });
});

describe("a failed save during getMany", () => {
  it("is not tried again while the stored data is unchanged", async () => {
    const adapter = {
      ...batchingAdapter({ layout: '{"compact":true}' }),
      set: vi.fn(() => Promise.reject(new Error("full"))),
    };
    const storage = createStorage({
      schema: defineStorageSchema({
        layout: defineVersions(z.object({ compact: z.boolean() })).next(
          z.object({ density: z.enum(["compact", "comfortable"]) }),
          (previous) => ({ density: previous.compact ? "compact" : "comfortable" }),
        ),
      }),
      adapter,
    });

    expect(await storage.getMany(["layout"])).toEqual({ layout: { density: "compact" } });
    expect(await storage.getMany(["layout"])).toEqual({ layout: { density: "compact" } });
    expect(adapter.set).toHaveBeenCalledOnce();
  });
});

describe("getManySync", () => {
  it("answers immediately, through the backend's synchronous batch where it has one", () => {
    const entries = new Map<string, string>([["theme", '"dark"']]);
    const calls: Array<string> = [];
    const storage = createStorage({
      schema,
      adapter: defineSyncAdapter({
        name: "batching",
        serializer: jsonSerializer,
        getSync: (key) => entries.get(key),
        setSync: (key, value) => {
          entries.set(key, value);
        },
        removeSync: (key) => {
          entries.delete(key);
        },
        getManySync: (keys) => {
          calls.push(keys.join(","));

          return new Map(
            keys.flatMap((key) => {
              const value = entries.get(key);

              return value === undefined ? [] : [[key, value] as const];
            }),
          );
        },
      }),
    });

    expect(storage.getManySync(["theme", "nickname"])).toEqual({
      theme: "dark",
      nickname: undefined,
    });
    expect(calls).toEqual(["theme,nickname"]);
  });

  it("migrates and saves on the synchronous path too", () => {
    const adapter = memoryAdapter({ initial: { layout: '{"compact":false}' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        layout: defineVersions(z.object({ compact: z.boolean() })).next(
          z.object({ density: z.enum(["compact", "comfortable"]) }),
          (previous) => ({ density: previous.compact ? "compact" : "comfortable" }),
        ),
      }),
      adapter,
    });

    expect(storage.getManySync(["layout"])).toEqual({ layout: { density: "comfortable" } });
    expect(adapter.entries.get("layout")).toBe('{"v":2,"d":{"density":"comfortable"}}');
  });
});
