import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageSchemaError,
  StorageUnsupportedError,
  withFallback,
} from "../src/index";
import type { ClearTargets, PlatformStorageError, SyncStorageAdapter } from "../src/index";
import { countSchema, themeSchema, userSchema } from "./fixtures/schemas";
import { batchingAdapter, feedAdapter, gate, recordingAdapter } from "./fakes/adapters";
import type { BatchingAdapter } from "./fakes/adapters";

const ada = { id: "1", name: "Ada" };
const stored = (value: unknown): string => JSON.stringify(value);

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light", readFrom: ["colorMode"] },
  user: { schema: userSchema, readFrom: ["old-user"] },
});

/* This storage's names, the names from before its prefix, a key since deleted, and another library's data. */
const HELD = {
  "app:theme": '"dark"',
  "app:colorMode": '"light"',
  "app:user": stored(ada),
  theme: '"dark"',
  colorMode: '"light"',
  "app:draft": "1",
  "analytics:session": "1",
};

/** A batching backend that can also list what it holds, recording the listing among its calls. */
function listingAdapter(
  initial: Readonly<Record<string, string>> = HELD,
  pauseAfter: (call: string) => Promise<void> | undefined = () => undefined,
): BatchingAdapter {
  const base = batchingAdapter(initial, pauseAfter);

  return {
    ...base,
    keys: async () => {
      base.calls.push("keys");
      const names = [...base.entries.keys()];
      await pauseAfter("keys");

      return names;
    },
  };
}

function collecting(): {
  readonly errors: Array<PlatformStorageError>;
  onError(error: PlatformStorageError): void;
} {
  const errors: Array<PlatformStorageError> = [];

  return {
    errors,
    onError: (error) => {
      errors.push(error);
    },
  };
}

/** The same memory backend through the synchronous methods, but able to list its names only asynchronously. */
function listingOnlyAsynchronously(initial: Readonly<Record<string, string>>): {
  readonly adapter: SyncStorageAdapter<string>;
  readonly entries: ReadonlyMap<string, string>;
} {
  const base = memoryAdapter({ initial });

  return {
    entries: base.entries,
    adapter: {
      name: "listing-later",
      serializer: base.serializer,
      get: base.get,
      set: base.set,
      remove: base.remove,
      getSync: base.getSync,
      setSync: base.setSync,
      removeSync: base.removeSync,
      ...(base.keys === undefined ? {} : { keys: base.keys }),
    },
  };
}

/** A memory backend that answers immediately but cannot list what it holds. */
function unlisted(): SyncStorageAdapter<string> {
  const base = memoryAdapter();

  return {
    name: "unlisted",
    serializer: base.serializer,
    get: base.get,
    set: base.set,
    remove: base.remove,
    getSync: base.getSync,
    setSync: base.setSync,
    removeSync: base.removeSync,
  };
}

describe("clear with a target", () => {
  it("removes only the declared names when given none, without listing", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear();

    expect(adapter.calls).toEqual(["removeMany app:colorMode,app:old-user,app:theme,app:user"]);
    expect([...adapter.entries.keys()]).toEqual([
      "theme",
      "colorMode",
      "app:draft",
      "analytics:session",
    ]);
  });

  it("removes the readFrom names alone, leaving each current value", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear("readFrom");

    expect(adapter.calls).toEqual(["removeMany app:colorMode,app:old-user"]);
    expect(await storage.get("theme")).toBe("dark");
  });

  it("removes the names from before the prefix, without reading anything while nothing reads them", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    storage.watch("theme", () => undefined);
    await storage.clear("unprefixed");

    expect(adapter.calls).toEqual(["removeMany theme,colorMode,user,old-user"]);
    expect(adapter.entries.has("app:theme")).toBe(true);
  });

  it("lists the backend for undeclared names, and removes only those under the prefix", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear("undeclared");

    expect(adapter.calls).toEqual(["keys", "removeMany app:draft"]);
    expect(adapter.entries.has("analytics:session")).toBe(true);
    expect(adapter.entries.has("theme")).toBe(true);
  });

  it("removes the whole backend for everything, in one call after listing", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear("everything");

    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0]).toBe("keys");
    expect(adapter.entries.size).toBe(0);
  });

  it("adds a list's targets together in one removal", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear(["readFrom", "unprefixed"]);

    expect(adapter.calls).toEqual([
      "removeMany app:colorMode,app:old-user,theme,colorMode,user,old-user",
    ]);
  });

  it("lists once for a list that needs it, and removes everything it names together", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    await storage.clear(["readFrom", "undeclared"]);

    expect(adapter.calls).toEqual([
      "keys",
      "getMany app:theme,app:colorMode,app:user,app:old-user",
      "removeMany app:colorMode,app:old-user,app:draft",
    ]);
    expect(keys).toEqual([]);
  });

  it("does nothing for an empty list", async () => {
    const adapter = listingAdapter();
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    await storage.clear([]);

    expect(adapter.calls).toEqual([]);
  });

  it("leaves another prefix's names alone, whatever this storage removes", () => {
    const adapter = memoryAdapter({ initial: { "b:theme": '"dark"', "b:draft": "1" } });
    const first = createStorage({ schema, adapter, prefix: "a:" });

    first.setSync("theme", "dark");
    first.clearSync(["declared", "undeclared", "unprefixed", "readFrom"]);

    expect(Object.fromEntries(adapter.entries)).toEqual({ "b:theme": '"dark"', "b:draft": "1" });
  });
});

describe("clear that cannot be carried out", () => {
  it("refuses a target that needs listing on a backend that cannot list, removing nothing", async () => {
    const adapter = batchingAdapter(HELD);
    const { errors, onError } = collecting();
    const storage = createStorage({ schema, adapter, prefix: "app:", onError });

    await expect(storage.clear("undeclared")).rejects.toBeInstanceOf(StorageUnsupportedError);
    await expect(storage.clear(["declared", "undeclared"])).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unsupported,
      operation: "clear",
      missing: "keys",
    });
    await expect(storage.clear("everything")).rejects.toThrow(
      "The recording adapter cannot list the names it holds, which `clear` needs to find what the schema does not declare. Nothing was removed.",
    );

    expect(adapter.calls).toEqual([]);
    expect(errors.map((error) => error.code)).toEqual([
      STORAGE_ERROR_CODE.Unsupported,
      STORAGE_ERROR_CODE.Unsupported,
      STORAGE_ERROR_CODE.Unsupported,
    ]);
  });

  it("refuses to list through a fallback pairing where either half cannot", async () => {
    const storage = createStorage({
      schema,
      adapter: withFallback(memoryAdapter(), unlisted()),
      onError: () => undefined,
    });

    await expect(storage.clear("undeclared")).rejects.toBeInstanceOf(StorageUnsupportedError);
  });

  it("reports a failure to list as the listing, once, and removes nothing", async () => {
    const adapter = { ...batchingAdapter(HELD), keys: () => Promise.reject(new Error("denied")) };
    const { errors, onError } = collecting();
    const storage = createStorage({ schema, adapter, prefix: "app:", onError });

    await expect(storage.clear("everything")).rejects.toMatchObject({ operation: "keys" });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(StorageAdapterError);
    expect(adapter.calls).toEqual([]);
  });

  it("refuses a target that is not one, reporting it and removing nothing", async () => {
    const adapter = listingAdapter();
    const { errors, onError } = collecting();
    const storage = createStorage({ schema, adapter, prefix: "app:", onError });

    await expect(storage.clear("all" as unknown as ClearTargets)).rejects.toBeInstanceOf(
      StorageSchemaError,
    );
    await expect(storage.clear(["everything"] as unknown as ClearTargets)).rejects.toThrow(
      /has to be asked for on its own/,
    );

    expect(errors).toHaveLength(2);
    expect(adapter.calls).toEqual([]);
  });

  it("warns and removes nothing for unprefixed names on a storage with no prefix", async () => {
    const adapter = listingAdapter();
    const { errors, onError } = collecting();
    const storage = createStorage({ schema, adapter, onError });

    await storage.clear("unprefixed");

    expect(adapter.calls).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(StorageSchemaError);
    expect(errors[0]?.message).toContain("this storage has no `prefix`");
  });

  it("still removes the rest of a list after warning about unprefixed names", async () => {
    const adapter = listingAdapter();
    const { errors, onError } = collecting();
    const storage = createStorage({ schema, adapter, onError });

    await storage.clear(["unprefixed", "readFrom"]);

    expect(adapter.calls).toEqual(["removeMany colorMode,old-user"]);
    expect(errors).toHaveLength(1);
  });
});

describe("clearSync with a target", () => {
  it("lists and removes without waiting", () => {
    const adapter = memoryAdapter({ initial: HELD });
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    storage.clearSync("undeclared");

    expect(adapter.entries.has("app:draft")).toBe(false);
    expect(adapter.entries.has("analytics:session")).toBe(true);

    storage.clearSync("everything");

    expect(adapter.entries.size).toBe(0);
  });

  it("refuses to list on a backend that can only list asynchronously, which clear still can", async () => {
    const { adapter, entries } = listingOnlyAsynchronously(HELD);
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    expect(() => {
      storage.clearSync("undeclared");
    }).toThrow(/cannot list the names it holds without waiting/);
    expect(entries.has("app:draft")).toBe(true);

    await storage.clear("undeclared");

    expect(entries.has("app:draft")).toBe(false);
  });

  it("throws for a target that is not one", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter(), prefix: "app:" });

    expect(() => {
      storage.clearSync(["readFrom", "everything"] as unknown as ClearTargets);
    }).toThrow(StorageSchemaError);
  });
});

describe("what clear announces", () => {
  it("announces a key whose value came from a removed readFrom name, and no other", async () => {
    const adapter = memoryAdapter({
      initial: { "app:colorMode": '"dark"', "app:user": stored(ada), "app:old-user": "{}" },
    });
    const storage = createStorage({ schema, adapter, prefix: "app:" });
    const changes: Array<unknown> = [];
    const keys: Array<string | undefined> = [];

    storage.watch("theme", (change) =>
      changes.push(["theme", change.oldValue, change.newValue, change.oldValueKnown]),
    );
    storage.watch("user", (change) => changes.push(["user", change.newValue]));
    storage.onChange((key) => keys.push(key));
    await storage.clear("readFrom");

    expect(changes).toEqual([["theme", "dark", "light", true]]);
    expect(keys).toEqual(["theme"]);
    expect(adapter.entries.has("app:old-user")).toBe(false);
  });

  it("announces what a later name holds as the new value", async () => {
    const adapter = memoryAdapter({ initial: { "app:colorMode": '"light"', theme: '"dark"' } });
    const storage = createStorage({ schema, adapter, prefix: "app:", readUnprefixed: true });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ oldValue, newValue }) => changes.push([oldValue, newValue]));
    await storage.clear("readFrom");

    expect(changes).toEqual([["light", "dark"]]);
  });

  it("announces nothing where a later name holds the same stored form", async () => {
    const adapter = memoryAdapter({ initial: { "app:colorMode": '"dark"', theme: '"dark"' } });
    const storage = createStorage({ schema, adapter, prefix: "app:", readUnprefixed: true });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    await storage.clear("readFrom");

    expect(keys).toEqual([]);
    expect(adapter.entries.has("app:colorMode")).toBe(false);
  });

  it("announces the names from before the prefix only while they are read", async () => {
    const reading = createStorage({
      schema,
      adapter: memoryAdapter({ initial: { colorMode: '"dark"' } }),
      prefix: "app:",
      readUnprefixed: true,
    });
    const ignoring = createStorage({
      schema,
      adapter: memoryAdapter({ initial: { colorMode: '"dark"' } }),
      prefix: "app:",
    });
    const keys: Array<string | undefined> = [];

    reading.onChange((key) => keys.push(`reading ${String(key)}`));
    ignoring.onChange((key) => keys.push(`ignoring ${String(key)}`));
    await reading.clear("unprefixed");
    await ignoring.clear("unprefixed");

    expect(keys).toEqual(["reading theme"]);
  });

  it("announces nothing for undeclared names", async () => {
    const storage = createStorage({
      schema,
      adapter: memoryAdapter({ initial: HELD }),
      prefix: "app:",
    });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    await storage.clear("undeclared");

    expect(keys).toEqual([]);
  });

  it("announces every declared key for everything", async () => {
    const storage = createStorage({
      schema,
      adapter: memoryAdapter({ initial: HELD }),
      prefix: "app:",
    });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ oldValue, newValue }) => changes.push(["theme", oldValue, newValue]));
    storage.watch("user", ({ oldValue, newValue }) => changes.push(["user", oldValue, newValue]));
    await storage.clear("everything");

    expect(changes).toEqual([
      ["theme", "dark", "light"],
      ["user", ada, undefined],
    ]);
  });

  it("reads each key again where what it held could not be fetched first", async () => {
    const adapter = {
      ...batchingAdapter({ "app:colorMode": '"dark"' }),
      getMany: () => Promise.reject(new Error("refused")),
    };
    const { errors, onError } = collecting();
    const storage = createStorage({ schema, adapter, prefix: "app:", onError });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => changes.push([change.newValue, change.oldValueKnown]));
    await storage.clear("readFrom");

    await vi.waitFor(() => {
      expect(changes).toEqual([["light", false]]);
    });
    expect(adapter.entries.has("app:colorMode")).toBe(false);
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Adapter]);
  });

  it("announces without waiting through clearSync", () => {
    const storage = createStorage({
      schema,
      adapter: memoryAdapter({ initial: { "app:colorMode": '"dark"' } }),
      prefix: "app:",
    });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ oldValue, newValue }) => changes.push([oldValue, newValue]));
    storage.clearSync("readFrom");

    expect(changes).toEqual([["dark", "light"]]);
  });

  it("reads each key again where the fetch fails without waiting", () => {
    const adapter = {
      ...memoryAdapter({ initial: { "app:colorMode": '"dark"' } }),
      getManySync: (): never => {
        throw new Error("refused");
      },
    };
    const storage = createStorage({ schema, adapter, prefix: "app:", onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => changes.push([change.newValue, change.oldValueKnown]));
    storage.clearSync("readFrom");

    expect(changes).toEqual([["light", false]]);
    expect(adapter.entries.has("app:colorMode")).toBe(false);
  });

  it("reads every key again when neither the fetch nor the removal goes through", async () => {
    const adapter = {
      ...batchingAdapter({ "app:colorMode": '"dark"', "app:old-user": stored(ada) }),
      getMany: () => Promise.reject(new Error("refused")),
      removeMany: () => Promise.reject(new Error("refused")),
    };
    const storage = createStorage({ schema, adapter, prefix: "app:", onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) => changes.push(["theme", change.newValue]));
    storage.watch("user", (change) => changes.push(["user", change.newValue]));

    await expect(storage.clear("readFrom")).rejects.toMatchObject({ operation: "removeMany" });
    await vi.waitFor(() => {
      expect(changes).toEqual([
        ["theme", "dark"],
        ["user", ada],
      ]);
    });
  });

  it("reads a moved key again where what it reads as afterwards cannot be fetched", async () => {
    const base = batchingAdapter({ "app:colorMode": '"dark"', "app:old-user": stored(ada) });
    let fetches = 0;
    const adapter = {
      ...base,
      getMany: (names: ReadonlyArray<string>) => {
        fetches += 1;

        return fetches === 1
          ? (base.getMany?.(names) ?? Promise.resolve(new Map<string, string>()))
          : Promise.reject(new Error("refused"));
      },
    };
    const storage = createStorage({ schema, adapter, prefix: "app:", onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) =>
      changes.push(["theme", change.newValue, change.oldValueKnown]),
    );
    storage.watch("user", (change) =>
      changes.push(["user", change.newValue, change.oldValueKnown]),
    );
    await storage.clear("readFrom");

    await vi.waitFor(() => {
      expect(changes).toEqual([
        ["theme", "light", false],
        ["user", undefined, false],
      ]);
    });
  });

  it("announces what the backend holds after the removal, even where a write landed in between", async () => {
    const fetched = gate();
    const release = gate();
    const base = memoryAdapter({ initial: { "app:colorMode": '"light"' } });
    const adapter = {
      ...base,
      /* Answers with what was held when it was asked, and only once released, which leaves a gap for a synchronous write. */
      getMany: async (names: ReadonlyArray<string>) => {
        const held = new Map(
          names.flatMap((name) => {
            const wire = base.getSync(name);

            return wire === undefined ? [] : [[name, wire] as const];
          }),
        );

        fetched.open();
        await release.opened;

        return held;
      },
    };
    const storage = createStorage({ schema, adapter, prefix: "app:" });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ newValue }) => changes.push(newValue));

    const clearing = storage.clear("readFrom");

    await fetched.opened;
    storage.setSync("theme", "dark");
    release.open();
    await clearing;

    await vi.waitFor(() => {
      expect(changes.at(-1)).toBe("dark");
    });
    expect(storage.getSync("theme")).toBe("dark");
  });

  it("reads every moving key again when the removal fails, then rejects", async () => {
    const adapter = {
      ...batchingAdapter({ "app:colorMode": '"dark"', "app:old-user": stored(ada) }),
      removeMany: () => Promise.reject(new Error("refused")),
    };
    const storage = createStorage({ schema, adapter, prefix: "app:" });
    const changes: Array<unknown> = [];

    storage.watch("theme", (change) =>
      changes.push(["theme", change.newValue, change.oldValueKnown]),
    );
    storage.watch("user", (change) =>
      changes.push(["user", change.newValue, change.oldValueKnown]),
    );

    await expect(storage.clear("readFrom")).rejects.toMatchObject({ operation: "removeMany" });
    await vi.waitFor(() => {
      expect(changes).toEqual([
        ["theme", "dark", false],
        ["user", ada, false],
      ]);
    });
  });

  it("leaves a removed current name to a backend that reports its own writes, so it is heard once", async () => {
    const adapter = feedAdapter({ "app:theme": '"dark"' }, true);
    const storage = createStorage({ schema, adapter, prefix: "app:" });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ oldValue, newValue }) => changes.push([oldValue, newValue]));
    await storage.clear("declared");
    adapter.emit({ key: "app:theme", oldValue: '"dark"', newValue: undefined });

    await vi.waitFor(() => {
      expect(changes).toEqual([["dark", "light"]]);
    });
  });

  it("announces a removed readFrom name itself on a backend that reports its own writes, and once", async () => {
    const adapter = feedAdapter({ "app:colorMode": '"dark"' }, true);
    const storage = createStorage({ schema, adapter, prefix: "app:" });
    const changes: Array<unknown> = [];

    storage.watch("theme", ({ oldValue, newValue }) => changes.push([oldValue, newValue]));
    await storage.clear("readFrom");
    adapter.emit({ key: "app:colorMode", oldValue: '"dark"', newValue: undefined });

    expect(changes).toEqual([["dark", "light"]]);
  });
});

describe("clear and the turns it holds", () => {
  it("lands after a write started before it, and before one started after it", async () => {
    const held = gate();
    const adapter = listingAdapter({ "app:colorMode": '"dark"' }, (call) =>
      call.startsWith("set ") ? held.opened : undefined,
    );
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    const before = storage.set("theme", "dark");
    const clearing = storage.clear("readFrom");
    const after = storage.set("theme", "light");

    await Promise.resolve();
    held.open();
    await Promise.all([before, clearing, after]);

    expect(adapter.calls).toEqual([
      "set app:theme",
      "remove app:colorMode",
      "removeMany app:colorMode,app:old-user",
      "set app:theme",
    ]);
    expect(await storage.get("theme")).toBe("light");
  });

  it("holds no key's turn for undeclared names, so a write is not kept waiting on the listing", async () => {
    const listed = gate();
    const adapter = listingAdapter(HELD, (call) => (call === "keys" ? listed.opened : undefined));
    const storage = createStorage({ schema, adapter, prefix: "app:" });

    const clearing = storage.clear("undeclared");
    await storage.set("user", ada);

    /* The write's own sweep of the old name runs as well, since this is the key's first write. */
    expect(adapter.calls).toEqual(["keys", "set app:user", "remove app:old-user"]);

    listed.open();
    await clearing;

    expect(adapter.calls.at(-1)).toBe("removeMany app:draft");
  });
});

/* One key with two old names, read from the first, where the backend removes the first and refuses the second. */
const twoOldNames = defineStorageSchema({
  value: { schema: countSchema, readFrom: ["old1", "old2"] },
});

function refusingSecondOldName(): ReturnType<typeof recordingAdapter> {
  const base = recordingAdapter({ old1: "1", old2: "2" });

  return {
    ...base,
    remove: (name: string) =>
      name === "old2" ? Promise.reject(new Error("refused")) : base.remove(name),
  };
}

function refusingSecondOldNameSync(): ReturnType<typeof memoryAdapter> {
  const base = memoryAdapter({ initial: { old1: "1", old2: "2" } });

  return {
    ...base,
    removeSync: (name: string) => {
      if (name === "old2") throw new Error("refused");

      base.removeSync(name);
    },
  };
}

describe("a removal that fails partway through one key's names", () => {
  it("still tells a watcher what the key reads as, through clear with a target", async () => {
    const adapter = refusingSecondOldName();
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];
    const keys: Array<string | undefined> = [];

    storage.watch("value", (change) => changes.push([change.newValue, change.oldValueKnown]));
    storage.onChange((key) => keys.push(key));

    await expect(storage.clear("readFrom")).rejects.toBeInstanceOf(StorageAdapterError);
    await vi.waitFor(() => {
      expect(changes).toEqual([[2, false]]);
    });
    expect(keys).toEqual(["value"]);
    expect(Object.fromEntries(adapter.entries)).toEqual({ old2: "2" });
    expect(await storage.get("value")).toBe(2);
  });

  it("still tells a watcher through clearSync", () => {
    const adapter = refusingSecondOldNameSync();
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push([change.newValue, change.oldValueKnown]));

    expect(() => {
      storage.clearSync("readFrom");
    }).toThrow(StorageAdapterError);
    expect(changes).toEqual([[2, false]]);
    expect(Object.fromEntries(adapter.entries)).toEqual({ old2: "2" });
  });

  it("still tells a watcher through clear with no target", async () => {
    const adapter = refusingSecondOldName();
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push([change.newValue, change.oldValueKnown]));

    await expect(storage.clear()).rejects.toBeInstanceOf(StorageAdapterError);
    await vi.waitFor(() => {
      expect(changes).toEqual([[2, false]]);
    });
  });

  it("still tells a watcher through remove", async () => {
    const adapter = refusingSecondOldName();
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push([change.newValue, change.oldValueKnown]));

    await expect(storage.remove("value")).rejects.toBeInstanceOf(StorageAdapterError);
    await vi.waitFor(() => {
      expect(changes).toEqual([[2, false]]);
    });
    expect(Object.fromEntries(adapter.entries)).toEqual({ old2: "2" });
  });

  it("still tells a watcher through removeSync", () => {
    const adapter = refusingSecondOldNameSync();
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push([change.newValue, change.oldValueKnown]));

    expect(() => {
      storage.removeSync("value");
    }).toThrow(StorageAdapterError);
    expect(changes).toEqual([[2, false]]);
  });

  it("still tells a watcher where what the key held could not be fetched first", async () => {
    const base = batchingAdapter({ old1: "1", old2: "2" });
    const adapter = {
      ...base,
      getMany: () => Promise.reject(new Error("refused")),
      removeMany: async (names: ReadonlyArray<string>) => {
        await base.removeMany?.(names.filter((name) => name !== "old2"));

        throw new Error("refused");
      },
    };
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push([change.newValue, change.oldValueKnown]));

    await expect(storage.clear("readFrom")).rejects.toMatchObject({ operation: "removeMany" });
    await vi.waitFor(() => {
      expect(changes).toEqual([[2, false]]);
    });
  });

  it("still tells a watcher on a backend that reports its own writes, which never names an old name", async () => {
    const base = feedAdapter({ old1: "1", old2: "2" }, true);
    const adapter = {
      ...base,
      remove: (name: string) =>
        name === "old2" ? Promise.reject(new Error("refused")) : base.remove(name),
    };
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push(change.newValue));

    await expect(storage.remove("value")).rejects.toBeInstanceOf(StorageAdapterError);
    await vi.waitFor(() => {
      expect(changes).toEqual([2]);
    });
  });

  it("says nothing where the one name a write touched was refused", async () => {
    const base = recordingAdapter({ value: "1" });
    const adapter = {
      ...base,
      set: () => Promise.reject(new Error("refused")),
    };
    const storage = createStorage({ schema: twoOldNames, adapter, onError: () => undefined });
    const changes: Array<unknown> = [];

    storage.watch("value", (change) => changes.push(change.newValue));

    await expect(storage.set("value", 5)).rejects.toBeInstanceOf(StorageAdapterError);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(changes).toEqual([]);
  });
});
