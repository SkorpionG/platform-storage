import * as z from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineKey,
  defineStorageSchema,
  defineVersions,
  memoryAdapter,
  StorageSchemaError,
} from "../src/index";
import type { PlatformStorageError } from "../src/index";
import { themeSchema, userSchema } from "./fixtures/schemas";
import { feedAdapter } from "./fakes/adapters";

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  user: { schema: userSchema, key: "u", readFrom: ["old"] },
  auth: defineKey(userSchema, { key: "vendor-token", readFrom: ["vendor-old"], prefixed: false }),
});

const ada = { id: "1", name: "Ada" };

describe("a storage with a prefix", () => {
  it("stores every key under the prefix", async () => {
    const adapter = memoryAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.set("theme", "dark");
    await storage.set("user", ada);

    expect([...adapter.entries.keys()]).toEqual(["app:theme", "app:u"]);
    expect(await storage.get("theme")).toBe("dark");
  });

  it("answers physicalKey with the prefixed name", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter(), prefix: "app:" });

    expect(storage.physicalKey("theme")).toBe("app:theme");
    expect(storage.physicalKey("user")).toBe("app:u");
    expect(storage.physicalKey("auth")).toBe("vendor-token");
  });

  it("leaves the schema's own names unprefixed, since one schema can back several storages", () => {
    createStorage({ schema, adapter: memoryAdapter(), prefix: "app:" });

    expect(schema.physicalKeys).toEqual({ theme: "theme", user: "u", auth: "vendor-token" });
  });

  it("does not read a value stored under the bare name", async () => {
    const adapter = memoryAdapter({ initial: { theme: '"dark"' } });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    expect(await storage.get("theme")).toBe("light");
    expect(adapter.entries.get("theme")).toBe('"dark"');
  });

  it("moves a value from an old name inside the prefix", async () => {
    const adapter = memoryAdapter({ initial: { "app:old": JSON.stringify(ada) } });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    expect(await storage.get("user")).toEqual(ada);
    expect([...adapter.entries.keys()]).toEqual(["app:u"]);
  });

  it("does not look for an old name outside the prefix", async () => {
    const adapter = memoryAdapter({ initial: { old: JSON.stringify(ada) } });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    expect(await storage.get("user")).toBeUndefined();
    expect(adapter.entries.has("old")).toBe(true);
  });

  it("keeps a key that opts out, and its old names, exactly as written", async () => {
    const adapter = memoryAdapter({ initial: { "vendor-old": JSON.stringify(ada) } });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    expect(await storage.get("auth")).toEqual(ada);
    expect([...adapter.entries.keys()]).toEqual(["vendor-token"]);
  });

  it("counts and clears its old names inside the prefix", async () => {
    const adapter = memoryAdapter({
      initial: { "app:old": JSON.stringify(ada), old: JSON.stringify(ada) },
    });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    expect(await storage.has("user")).toBe(true);

    await storage.clear();

    expect([...adapter.entries.keys()]).toEqual(["old"]);
  });

  it("migrates a versioned key under the prefix and saves it there", async () => {
    const adapter = memoryAdapter({ initial: { "app:layout": '{"compact":true}' } });
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

    expect(await storage.get("layout")).toEqual({ density: "compact" });
    expect(adapter.entries.get("app:layout")).toBe('{"v":2,"d":{"density":"compact"}}');
  });
});

describe("two storages sharing a backend and a schema under different prefixes", () => {
  it("never see each other's values", async () => {
    const adapter = memoryAdapter();
    const first = createStorage({ schema, adapter, prefix: "a:" });
    const second = createStorage({ schema, adapter, prefix: "b:" });

    await first.set("theme", "dark");

    expect(await second.get("theme")).toBe("light");
    expect(await second.has("theme")).toBe(false);
  });

  it("leave each other alone when one clears", async () => {
    const adapter = memoryAdapter();
    const first = createStorage({ schema, adapter, prefix: "a:" });
    const second = createStorage({ schema, adapter, prefix: "b:" });

    await first.set("theme", "dark");
    await second.set("theme", "dark");
    await first.clear();

    expect([...adapter.entries.keys()]).toEqual(["b:theme"]);
  });

  it("hear only their own changes from the backend", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter, prefix: "a:" });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    adapter.emit({ key: "b:theme", oldValue: undefined, newValue: '"dark"' });
    adapter.emit({ key: "theme", oldValue: undefined, newValue: '"dark"' });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(keys).toEqual([]);

    adapter.emit({ key: "a:theme", oldValue: undefined, newValue: '"dark"' });

    await vi.waitFor(() => {
      expect(keys).toEqual(["theme"]);
    });
  });
});

function adopting(initial: Readonly<Record<string, string>>) {
  const adapter = memoryAdapter({ initial });
  const storage = createStorage({ schema, adapter, prefix: "app:", readUnprefixed: true });

  return { adapter, storage };
}

describe("a storage reading unprefixed names", () => {
  it("moves a value from the bare name in under the prefix", async () => {
    const { adapter, storage } = adopting({ theme: '"dark"' });

    expect(await storage.get("theme")).toBe("dark");
    expect([...adapter.entries.keys()]).toEqual(["app:theme"]);
  });

  it("tries the prefixed old names before any bare one, and the bare current name before bare old names", async () => {
    const { storage } = adopting({
      old: JSON.stringify({ id: "3", name: "bare old" }),
      u: JSON.stringify({ id: "2", name: "bare current" }),
      "app:old": JSON.stringify({ id: "1", name: "prefixed old" }),
    });

    expect(await storage.get("user")).toEqual({ id: "1", name: "prefixed old" });
  });

  it("reaches the bare current name ahead of a bare old one", async () => {
    const { storage } = adopting({
      old: JSON.stringify({ id: "3", name: "bare old" }),
      u: JSON.stringify({ id: "2", name: "bare current" }),
    });

    expect(await storage.get("user")).toEqual({ id: "2", name: "bare current" });
  });

  it("prefers a value already under the prefix, leaving the bare one", async () => {
    const { adapter, storage } = adopting({ theme: '"dark"', "app:theme": '"light"' });

    expect(await storage.get("theme")).toBe("light");
    expect(adapter.entries.get("theme")).toBe('"dark"');
  });

  it("adds nothing for a key that opts out of the prefix", async () => {
    const { adapter, storage } = adopting({ "vendor-old": JSON.stringify(ada) });

    expect(await storage.get("auth")).toEqual(ada);
    expect([...adapter.entries.keys()]).toEqual(["vendor-token"]);
    expect(storage.physicalKey("auth")).toBe("vendor-token");
  });

  it("counts a bare name in has, and clear removes it", async () => {
    const { adapter, storage } = adopting({ theme: '"dark"', unrelated: "1" });

    expect(await storage.has("theme")).toBe(true);

    await storage.clear();

    expect([...adapter.entries.keys()]).toEqual(["unrelated"]);
  });

  it("removes the bare name once a write lands", async () => {
    const { adapter, storage } = adopting({ theme: '"dark"' });

    await storage.set("theme", "light");

    expect([...adapter.entries.keys()]).toEqual(["app:theme"]);
  });

  it("migrates a versioned key's bare value as it moves it", async () => {
    const adapter = memoryAdapter({ initial: { layout: '{"compact":true}' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        layout: defineVersions(z.object({ compact: z.boolean() })).next(
          z.object({ density: z.enum(["compact", "comfortable"]) }),
          (previous) => ({ density: previous.compact ? "compact" : "comfortable" }),
        ),
      }),
      adapter,
      prefix: "app:",
      readUnprefixed: true,
    });

    expect(await storage.get("layout")).toEqual({ density: "compact" });
    expect([...adapter.entries]).toEqual([["app:layout", '{"v":2,"d":{"density":"compact"}}']]);
  });

  it("reads a bare value for an update and writes the result under the prefix", async () => {
    const { adapter, storage } = adopting({ theme: '"dark"' });

    await storage.update("theme", (current) => (current === "dark" ? "light" : "dark"));

    expect([...adapter.entries]).toEqual([["app:theme", '"light"']]);
  });

  it("removes only the bare name when the remove policy meets invalid data there", async () => {
    const adapter = memoryAdapter({ initial: { theme: '"neon"', old: '"dark"' } });
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: themeSchema, readFrom: ["old"] } }),
      adapter,
      prefix: "app:",
      readUnprefixed: true,
      onInvalid: "remove",
    });

    expect(await storage.get("theme")).toBeUndefined();
    expect([...adapter.entries.keys()]).toEqual(["old"]);
  });

  it("saves a recover result under the prefix, removing only the bare name it came from", async () => {
    const adapter = memoryAdapter({ initial: { theme: '"DARK"', old: '"light"' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        theme: defineKey(themeSchema, {
          readFrom: ["old"],
          recover: (raw) => (raw === "DARK" ? "dark" : undefined),
        }),
      }),
      adapter,
      prefix: "app:",
      readUnprefixed: true,
    });

    expect(await storage.get("theme")).toBe("dark");
    expect(Object.fromEntries(adapter.entries)).toEqual({ "app:theme": '"dark"', old: '"light"' });
  });

  it("reports removing a value held only under a bare name, where the backend would not", async () => {
    const adapter = memoryAdapter({ initial: { theme: '"dark"' } });
    const storage = createStorage({ schema, adapter, prefix: "app:", readUnprefixed: true });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => {
      changes.push(change.oldValue);
    });
    await storage.remove("theme");

    expect(changes).toEqual(["dark"]);
    expect(adapter.entries.size).toBe(0);
  });

  it("is refused without a prefix to read past, and reported", () => {
    const errors: Array<PlatformStorageError> = [];
    const building = (): void => {
      createStorage({
        schema,
        adapter: memoryAdapter(),
        readUnprefixed: true,
        onError: (error) => {
          errors.push(error);
        },
      });
    };

    expect(building).toThrow(/needs a `prefix`/);
    expect(errors).toHaveLength(1);
  });

  it("is refused when it is not a boolean", () => {
    expect(() =>
      createStorage({
        schema,
        adapter: memoryAdapter(),
        prefix: "app:",
        readUnprefixed: "yes",
      } as unknown as Parameters<typeof createStorage>[0]),
    ).toThrow(/`readUnprefixed` has to be `true` or `false`/);
  });

  it("is refused where a bare name lands on another key's prefixed name", () => {
    const clashing = defineStorageSchema({
      b: { schema: themeSchema },
      ab: { schema: themeSchema },
    });

    expect(() =>
      createStorage({ schema: clashing, adapter: memoryAdapter(), prefix: "a" }),
    ).not.toThrow();
    expect(() =>
      createStorage({
        schema: clashing,
        adapter: memoryAdapter(),
        prefix: "a",
        readUnprefixed: true,
      }),
    ).toThrow(/"ab" reads from "ab", which is where "b" stores/);
  });
});

describe("names a prefix makes clash", () => {
  it("are refused when a key opting out takes another key's prefixed name", () => {
    const clashing = defineStorageSchema({
      user: { schema: userSchema },
      raw: { schema: userSchema, key: "app:user", prefixed: false },
    });

    const errors: Array<PlatformStorageError> = [];

    expect(() => createStorage({ schema: clashing, adapter: memoryAdapter() })).not.toThrow();
    expect(() =>
      createStorage({
        schema: clashing,
        adapter: memoryAdapter(),
        prefix: "app:",
        onError: (error) => {
          errors.push(error);
        },
      }),
    ).toThrow(/"user" and "raw" both store under "app:user"/);
    expect(errors).toHaveLength(1);
  });

  it("are refused when an old name lands on another key's current name", () => {
    const clashing = defineStorageSchema({
      user: { schema: userSchema, readFrom: ["theme"] },
      raw: { schema: themeSchema, key: "app:theme", prefixed: false },
    });

    expect(() =>
      createStorage({ schema: clashing, adapter: memoryAdapter(), prefix: "app:" }),
    ).toThrow(/"user" reads from "app:theme"/);
  });

  it("are refused when two keys come to claim one old name", () => {
    const clashing = defineStorageSchema({
      user: { schema: userSchema, readFrom: ["old"] },
      raw: { schema: userSchema, key: "raw", readFrom: ["app:old"], prefixed: false },
    });

    expect(() =>
      createStorage({ schema: clashing, adapter: memoryAdapter(), prefix: "app:" }),
    ).toThrow(/both read from "app:old"/);
  });
});

describe("a prefix that cannot be one", () => {
  it.each([
    ["empty", ""],
    ["not a string", 7],
  ])("is refused when %s, and reported", (_label, prefix) => {
    const errors: Array<PlatformStorageError> = [];
    const building = (): void => {
      createStorage({
        schema,
        adapter: memoryAdapter(),
        prefix: prefix as string,
        onError: (error) => {
          errors.push(error);
        },
      });
    };

    expect(building).toThrow(StorageSchemaError);
    expect(errors).toHaveLength(1);
  });
});
