import * as z from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  defineSyncAdapter,
  defineVersions,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageSerializationError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../src/index";
import type { PlatformStorageError } from "../src/index";
import { anythingSchema, themeSchema, userSchema } from "./fixtures/schemas";
import { batchingAdapter, feedAdapter, gate, recordingAdapter } from "./fakes/adapters";

const ada = { id: "1", name: "Ada" };
const stored = (value: unknown): string => JSON.stringify(value);

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  user: { schema: userSchema, key: "u", readFrom: ["old-user"] },
  nickname: { schema: z.string().optional() },
  alias: { schema: z.string().optional(), readFrom: ["old-alias"] },
  anything: { schema: anythingSchema },
});

describe("setMany", () => {
  it("writes every value in one call", async () => {
    /* A single key's old names are swept name by name, so a failure there still names the old name. */
    const adapter = batchingAdapter();
    const storage = createStorage({ schema, adapter });

    await storage.setMany({ theme: "dark", user: ada });

    /* The second call sweeps the old name `user` declares, which only the first write to it does. */
    expect(adapter.calls).toEqual(["setMany theme,u", "remove old-user"]);
    expect(await storage.getMany(["theme", "user"])).toEqual({ theme: "dark", user: ada });
  });

  it("writes each value in turn on a backend with no batch call", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({ schema, adapter });

    await storage.setMany({ theme: "dark", nickname: "ada" });

    expect(adapter.calls).toEqual(["set theme", "set nickname"]);
  });

  it("writes nothing when one value fails its schema, rejecting with that key's error", async () => {
    const adapter = batchingAdapter();
    const storage = createStorage({ schema, adapter });

    await expect(
      storage.setMany({ theme: "dark", user: { id: 1 } as unknown as typeof ada }),
    ).rejects.toMatchObject({ key: "user" });
    await expect(
      storage.setMany({ theme: "dark", user: { id: 1 } as unknown as typeof ada }),
    ).rejects.toBeInstanceOf(StorageValidationError);
    expect(adapter.calls).toEqual([]);
  });

  it("writes nothing when one value cannot be serialized", async () => {
    const adapter = batchingAdapter();
    const storage = createStorage({ schema, adapter });

    await expect(storage.setMany({ theme: "dark", anything: 1n })).rejects.toBeInstanceOf(
      StorageSerializationError,
    );
    expect(adapter.calls).toEqual([]);
  });

  it("removes a key set to undefined, old names included, in one more call", async () => {
    const adapter = batchingAdapter({ nickname: '"ada"', alias: '"a"', "old-alias": '"b"' });
    const storage = createStorage({ schema, adapter });

    await storage.setMany({ theme: "dark", nickname: undefined, alias: undefined });

    expect(adapter.calls).toEqual(["setMany theme", "removeMany old-alias,nickname,alias"]);
    expect(Object.fromEntries(adapter.entries)).toEqual({ theme: '"dark"' });
  });

  it("sweeps several written keys' old names in one call", async () => {
    const adapter = batchingAdapter({ "old-user": stored(ada), "old-alias": '"a"' });
    const storage = createStorage({ schema, adapter });

    await storage.setMany({ user: ada, alias: "b" });

    expect(adapter.calls).toEqual(["setMany u,alias", "removeMany old-user,old-alias"]);
  });

  it("sweeps a written key's old names once", async () => {
    const adapter = batchingAdapter({ "old-user": stored(ada) });
    const storage = createStorage({ schema, adapter });

    await storage.setMany({ user: ada });
    await storage.setMany({ user: ada });

    expect(adapter.calls).toEqual(["setMany u", "remove old-user", "setMany u"]);
  });

  it("stores a versioned key as its latest version, under the storage's prefix", async () => {
    const adapter = batchingAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({
        layout: defineVersions(z.object({ compact: z.boolean() })).next(
          z.object({ density: z.enum(["compact", "comfortable"]) }),
          (previous) => ({ density: previous.compact ? "compact" : "comfortable" }),
        ),
      }),
      adapter,
      prefix: "app:",
    });

    await storage.setMany({ layout: { density: "compact" } });

    expect(Object.fromEntries(adapter.entries)).toEqual({
      "app:layout": '{"v":2,"d":{"density":"compact"}}',
    });
  });

  it("does nothing for an empty object", async () => {
    const adapter = batchingAdapter();
    const storage = createStorage({ schema, adapter });

    await storage.setMany({});

    expect(adapter.calls).toEqual([]);
  });

  it("throws for an undeclared key before writing anything", async () => {
    const adapter = batchingAdapter();
    const storage = createStorage({ schema, adapter });

    await expect(
      storage.setMany({ theme: "dark", nope: 1 } as unknown as { theme: "dark" }),
    ).rejects.toBeInstanceOf(UnknownStorageKeyError);
    expect(adapter.calls).toEqual([]);
  });

  it("tells watchers about each key, with the values it replaced read in one call", async () => {
    const adapter = batchingAdapter({ theme: '"dark"' });
    const storage = createStorage({
      schema: defineStorageSchema({ ...schema.definition }),
      adapter,
    });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ oldValue, newValue }) => changes.push(["theme", oldValue, newValue]));
    storage.watch("nickname", ({ oldValue, newValue }) =>
      changes.push(["nickname", oldValue, newValue]),
    );
    await storage.setMany({ theme: "light", nickname: "ada" });

    expect(changes).toEqual([
      ["theme", "dark", "light"],
      ["nickname", undefined, "ada"],
    ]);
    expect(adapter.calls[0]).toBe("getMany theme,nickname");
  });

  it("announces each key to onChange", async () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    await storage.setMany({ theme: "dark", nickname: "ada" });

    expect(keys).toEqual(["theme", "nickname"]);
  });

  it("tells a watcher about a value removed from an old name, which a backend would not report", async () => {
    const adapter = feedAdapter({ "old-alias": '"a"' }, true);
    const storage = createStorage({ schema, adapter });
    const removed: Array<unknown> = [];

    storage.watch("alias", ({ oldValue, newValue }) => removed.push([oldValue, newValue]));
    await storage.setMany({ alias: undefined });

    expect(removed).toEqual([["a", undefined]]);
  });

  it("still writes when the values it replaces cannot be read", async () => {
    const errors: Array<PlatformStorageError> = [];
    const adapter = { ...batchingAdapter(), getMany: () => Promise.reject(new Error("refused")) };
    const storage = createStorage({
      schema,
      adapter,
      onError: (error) => {
        errors.push(error);
      },
    });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => changes.push(change.oldValueKnown));
    storage.watch("nickname", (change) => changes.push(change.oldValueKnown));
    await storage.setMany({ theme: "dark", nickname: "ada" });

    expect(adapter.entries.get("theme")).toBe('"dark"');
    expect(changes).toEqual([false, false]);
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Adapter]);
  });

  it("waits for a write already started on any of its keys, and holds later ones back", async () => {
    const landing = gate();
    const base = batchingAdapter();
    const order: Array<string> = [];
    const storage = createStorage({
      schema,
      adapter: {
        ...base,
        set: (key: string, value: string) =>
          (key === "nickname" ? landing.opened : Promise.resolve()).then(() => {
            order.push(`set ${key}=${value}`);

            return base.set(key, value);
          }),
        setMany: (entries: ReadonlyMap<string, string>) => {
          order.push(`setMany ${[...entries.keys()].join(",")}`);

          return base.setMany?.(entries) ?? Promise.resolve();
        },
      },
    });

    const before = storage.set("nickname", "first");
    const batch = storage.setMany({ nickname: "batch", theme: "dark" });
    const after = storage.set("theme", "light");

    await Promise.resolve();
    landing.open();
    await Promise.all([before, batch, after]);

    expect(order).toEqual(['set nickname="first"', "setMany nickname,theme", 'set theme="light"']);
    expect(await storage.getMany(["nickname", "theme"])).toEqual({
      nickname: "batch",
      theme: "light",
    });
  });
});

describe("removeMany", () => {
  it("removes every key, old names first, in one call", async () => {
    const adapter = batchingAdapter({
      theme: '"dark"',
      u: stored(ada),
      "old-user": stored(ada),
      x: "1",
    });
    const storage = createStorage({ schema, adapter });

    await storage.removeMany(["theme", "user", "theme"]);

    expect(adapter.calls).toEqual(["removeMany old-user,theme,u"]);
    expect(Object.fromEntries(adapter.entries)).toEqual({ x: "1" });
  });

  it("does nothing for an empty list, and refuses an undeclared key before removing anything", async () => {
    const adapter = batchingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema, adapter });

    await storage.removeMany([]);
    await expect(storage.removeMany(["theme", "nope" as "theme"])).rejects.toBeInstanceOf(
      UnknownStorageKeyError,
    );

    expect(adapter.calls).toEqual([]);
  });

  it("tells watchers each key is gone", async () => {
    const storage = createStorage({
      schema,
      adapter: memoryAdapter({ initial: { theme: '"dark"' } }),
    });
    const changes = vi.fn();

    storage.watch("theme", changes);
    await storage.removeMany(["theme", "nickname"]);

    expect(changes).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ oldValue: "dark", newValue: "light" }),
    );
  });
});

describe("clear", () => {
  it("removes every declared name in one call, leaving everything else", async () => {
    const adapter = batchingAdapter({ theme: '"dark"', "old-user": stored(ada), foreign: "1" });
    const storage = createStorage({ schema, adapter });

    await storage.clear();

    expect(adapter.calls).toEqual([
      "removeMany old-user,old-alias,theme,u,nickname,alias,anything",
    ]);
    expect(Object.fromEntries(adapter.entries)).toEqual({ foreign: "1" });
  });

  it("removes only this storage's prefixed names", async () => {
    const adapter = batchingAdapter({ "app:theme": '"dark"', theme: '"dark"' });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear();

    expect(Object.fromEntries(adapter.entries)).toEqual({ theme: '"dark"' });
  });

  it("names the batch operation, and no key, when the backend refuses the batch", async () => {
    const storage = createStorage({
      schema,
      adapter: { ...batchingAdapter(), removeMany: () => Promise.reject(new Error("refused")) },
    });

    await expect(storage.clear()).rejects.toMatchObject({
      operation: "removeMany",
      physicalKey: undefined,
    });
  });
});

describe("the synchronous half", () => {
  it("writes and removes several keys without waiting", () => {
    const adapter = memoryAdapter({ initial: { "old-user": stored(ada) } });
    const storage = createStorage({ schema, adapter });

    storage.setManySync({ theme: "dark", user: ada });

    expect(Object.fromEntries(adapter.entries)).toEqual({ theme: '"dark"', u: stored(ada) });

    storage.removeManySync(["theme", "user"]);

    expect(adapter.entries.size).toBe(0);
  });

  it("writes nothing on the synchronous path either when one value fails", () => {
    const adapter = memoryAdapter();
    const storage = createStorage({ schema, adapter });

    expect(() => {
      storage.setManySync({ theme: "neon" as "dark", nickname: "ada" });
    }).toThrow(StorageValidationError);
    expect(adapter.entries.size).toBe(0);
  });
});

/** A synchronous memory backend that refuses to write or remove one name, with no batch calls, so the engine goes name by name. */
function refusingOne(refused: string, initial: Readonly<Record<string, string>> = {}) {
  const memory = memoryAdapter({ initial });

  return {
    memory,
    adapter: defineSyncAdapter({
      name: "refusing-one",
      serializer: memory.serializer,
      getSync: (key) => memory.getSync(key),
      setSync: (key, value) => {
        if (key === refused) throw new Error("refused");

        memory.setSync(key, value);
      },
      removeSync: (key) => {
        if (key === refused) throw new Error("refused");

        memory.removeSync(key);
      },
    }),
  };
}

describe("a batch that fails partway", () => {
  it("still tells watchers about a write that landed before the failure", async () => {
    const { adapter, memory } = refusingOne("nickname");
    const storage = createStorage({ schema, adapter });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => changes.push(change.newValue));

    await expect(storage.setMany({ theme: "dark", nickname: "ada" })).rejects.toMatchObject({
      operation: "set",
    });

    expect(memory.entries.get("theme")).toBe('"dark"');
    await vi.waitFor(() => {
      expect(changes).toEqual(["dark"]);
    });
  });

  it("still tells watchers about a key clear removed before the failure", async () => {
    const { adapter, memory } = refusingOne("nickname", { theme: '"dark"', nickname: '"ada"' });
    const storage = createStorage({ schema, adapter });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => changes.push(change.newValue));

    await expect(storage.clear()).rejects.toMatchObject({ operation: "remove" });

    expect(memory.entries.has("theme")).toBe(false);
    await vi.waitFor(() => {
      expect(changes).toEqual(["light"]);
    });
  });
});

describe("a single key's bookkeeping, on a backend with batch calls", () => {
  it("names the old name a sweep could not remove", async () => {
    const errors: Array<PlatformStorageError> = [];
    const storage = createStorage({
      schema,
      adapter: {
        ...batchingAdapter({ "old-user": stored(ada) }),
        remove: () => Promise.reject(new Error("refused")),
        removeMany: () => Promise.reject(new Error("refused")),
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    await storage.set("user", ada);

    expect(errors[0]).toMatchObject({ operation: "remove", physicalKey: "old-user" });
  });

  it("names the key whose replaced value could not be read for a watcher", async () => {
    const errors: Array<PlatformStorageError> = [];
    const storage = createStorage({
      schema,
      adapter: {
        ...batchingAdapter(),
        get: () => Promise.reject(new Error("refused")),
        getMany: () => Promise.reject(new Error("refused")),
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    storage.watch("theme", () => undefined);
    await storage.set("theme", "dark");

    expect(errors[0]).toMatchObject({ operation: "get", physicalKey: "theme" });
  });
});

describe("the order a batch is announced in", () => {
  const pair = defineStorageSchema({
    a: { schema: z.number().optional() },
    b: { schema: z.number().optional() },
  });

  it("delivers every key of a batch before a write a listener makes in response", () => {
    const storage = createStorage({ schema: pair, adapter: memoryAdapter() });
    const observed: Array<number | undefined> = [];

    storage.onChange((key) => {
      if (key === "a") storage.setSync("b", 2);
    });
    storage.watch("b", ({ newValue }) => observed.push(newValue));
    storage.setManySync({ a: 1, b: 1 });

    expect(observed).toEqual([1, 2]);
    expect(storage.getSync("b")).toBe(2);
  });

  it("does the same for a batch removal", () => {
    const storage = createStorage({
      schema: pair,
      adapter: memoryAdapter({ initial: { a: "1", b: "1" } }),
    });
    const observed: Array<number | undefined> = [];

    storage.onChange((key) => {
      if (key === "a") storage.setSync("b", 2);
    });
    storage.watch("b", ({ newValue }) => observed.push(newValue));
    storage.removeManySync(["a", "b"]);

    expect(observed).toEqual([undefined, 2]);
    expect(storage.getSync("b")).toBe(2);
  });
});
