import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  jsonSerializer,
  memoryAdapter,
  passthroughSerializer,
  STORAGE_ERROR_CODE,
  STORAGE_OPERATION,
  StorageAdapterError,
  StorageSerializationError,
  StorageUnavailableError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "../../index";
import type { StorageAdapter } from "../../index";
import {
  anythingSchema,
  asyncStringSchema,
  countSchema,
  nicknameSchema,
  nullableNameSchema,
  slowerWhenLongerSchema,
  tagsSchema,
  themeSchema,
  userSchema,
} from "../../../tests/fixtures/schemas";
import {
  adapterWithoutPresenceCheck,
  failingAdapter,
  gate,
  jsonValueAdapter,
  recordingAdapter,
} from "../../../tests/fakes/adapters";

const schema = defineStorageSchema({
  theme: { schema: themeSchema },
  themeWithDefault: { schema: themeSchema, key: "app:theme", default: "light" },
  count: { schema: countSchema },
  nickname: { schema: nicknameSchema },
  user: { schema: userSchema },
  tags: { schema: tagsSchema },
  nullableName: { schema: nullableNameSchema },
  anything: { schema: anythingSchema },
});

function build(adapter = memoryAdapter()) {
  return { adapter, storage: createStorage({ schema, adapter }) };
}

describe("reading and writing", () => {
  it("round-trips a value through the backend", async () => {
    const { storage } = build();

    await storage.set("user", { id: "u1", name: "Ada" });

    expect(await storage.get("user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("stores the serialized form under the physical key", async () => {
    const { adapter, storage } = build();

    await storage.set("themeWithDefault", "dark");

    expect(adapter.entries.get("app:theme")).toBe('"dark"');
    expect(adapter.entries.has("themeWithDefault")).toBe(false);
  });

  it("returns undefined for a key with nothing stored and nothing to fall back on", async () => {
    const { storage } = build();

    expect(await storage.get("theme")).toBeUndefined();
  });

  it("returns the declared default when nothing is stored", async () => {
    const { storage } = build();

    expect(await storage.get("themeWithDefault")).toBe("light");
  });

  it("lets the schema answer for a missing key when it carries its own default", async () => {
    const { storage } = build();

    expect(await storage.get("count")).toBe(0);
  });

  it("stores what the schema produced, not what was passed in", async () => {
    const { adapter, storage } = build();

    await storage.set("count", 3);

    expect(adapter.entries.get("count")).toBe("3");
  });

  it("removes a value", async () => {
    const { storage } = build();

    await storage.set("theme", "dark");
    await storage.remove("theme");

    expect(await storage.get("theme")).toBeUndefined();
  });

  it("reports presence without validating what is there", async () => {
    const { adapter, storage } = build();

    expect(await storage.has("theme")).toBe(false);

    adapter.setSync("theme", '"purple"');

    expect(await storage.has("theme")).toBe(true);
  });

  it("exposes the physical key a logical key resolves to", () => {
    const { storage } = build();

    expect(storage.physicalKey("themeWithDefault")).toBe("app:theme");
    expect(storage.physicalKey("theme")).toBe("theme");
  });
});

describe("writing invalid data", () => {
  it("rejects a value the schema does not accept", async () => {
    const { storage } = build();

    await expect(storage.set("theme", "purple" as never)).rejects.toThrow(StorageValidationError);
  });

  it("writes nothing when the value is rejected", async () => {
    const { adapter, storage } = build();

    await expect(storage.set("theme", "purple" as never)).rejects.toThrow();

    expect(adapter.entries.size).toBe(0);
  });

  it("says the failure happened on a write", async () => {
    const { storage } = build();

    await storage.set("theme", "purple" as never).catch((error: StorageValidationError) => {
      expect(error.operation).toBe("set");
      expect(error.raw).toBe("purple");
    });

    expect.assertions(2);
  });

  it("removes the entry when the schema produces undefined, which no wire value represents", async () => {
    const { adapter, storage } = build();

    await storage.set("nickname", "ada");
    expect(adapter.entries.has("nickname")).toBe(true);

    await storage.set("nickname", undefined);
    expect(adapter.entries.has("nickname")).toBe(false);
  });
});

describe("null is a value, not an absence", () => {
  it("round-trips null, so a nullable schema keeps what it stored", async () => {
    const { storage } = build();

    await storage.set("nullableName", null);

    expect(await storage.get("nullableName")).toBeNull();
  });

  it("tells a stored null apart from a key that holds nothing", async () => {
    const { storage } = build();

    await storage.set("nullableName", null);
    expect(await storage.has("nullableName")).toBe(true);

    await storage.remove("nullableName");
    expect(await storage.get("nullableName")).toBeUndefined();
    expect(await storage.has("nullableName")).toBe(false);
  });
});

describe("values the serializer cannot represent", () => {
  it("reports a write it could not serialize, naming the direction", async () => {
    const { storage } = build();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    await storage.set("anything", circular).catch((error: StorageSerializationError) => {
      expect(error).toBeInstanceOf(StorageSerializationError);
      expect(error.direction).toBe("serialize");
      expect(error.key).toBe("anything");
      expect(error.message).toContain("Serializing");
    });

    expect.assertions(4);
  });

  it("writes nothing when serializing fails", async () => {
    const { adapter, storage } = build();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    await expect(storage.set("anything", circular)).rejects.toThrow();

    expect(adapter.entries.size).toBe(0);
  });

  it("reports it to the observer, as every other failure is", async () => {
    const onError = vi.fn();
    const storage = createStorage({ schema, adapter: memoryAdapter(), onError });
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    await expect(storage.set("anything", circular)).rejects.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("clear", () => {
  it("removes every key the schema declares", async () => {
    const { adapter, storage } = build();

    await storage.set("theme", "dark");
    await storage.set("themeWithDefault", "dark");
    await storage.clear();

    expect(adapter.entries.size).toBe(0);
  });

  it("leaves keys the schema does not declare alone", async () => {
    const adapter = memoryAdapter({ initial: { "someone-elses-key": '"keep me"' } });
    const storage = createStorage({ schema, adapter });

    await storage.set("theme", "dark");
    await storage.clear();

    expect(adapter.entries.get("someone-elses-key")).toBe('"keep me"');
  });

  /*
    Nothing reports the `clear` operation. Removing the declared keys one at a time is what lets a failure name the key the backend refused, which is more use than knowing only that a clear went wrong somewhere. `STORAGE_OPERATION.Clear` names the method for the rest of the API, not a call any adapter receives.
  */
  it("reports a refusal as a remove, naming the key the backend would not delete", async () => {
    const adapter = {
      ...memoryAdapter({ name: "stubborn" }),
      remove: () => Promise.reject(new Error("refused")),
    };
    const storage = createStorage({ schema, adapter });

    await expect(storage.clear()).rejects.toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Adapter,
        adapter: "stubborn",
        operation: STORAGE_OPERATION.Remove,
        physicalKey: "theme",
      }),
    );
  });
});

describe("unknown keys", () => {
  it("rejects a key the schema does not declare", async () => {
    const { storage } = build();

    await expect(storage.get("nope" as never)).rejects.toThrow(UnknownStorageKeyError);
  });

  it("names the keys that do exist", async () => {
    const { storage } = build();

    await storage.get("nope" as never).catch((error: UnknownStorageKeyError) => {
      expect(error.knownKeys).toContain("theme");
    });

    expect.assertions(1);
  });
});

describe("backend failures", () => {
  it("wraps a foreign error, naming the adapter and the operation", async () => {
    const storage = createStorage({ schema, adapter: failingAdapter("disk on fire") });

    await storage.get("theme").catch((error: StorageAdapterError) => {
      expect(error).toBeInstanceOf(StorageAdapterError);
      expect(error.adapter).toBe("failing");
      expect(error.operation).toBe("get");
      expect(error.physicalKey).toBe("theme");
      expect((error.cause as Error).message).toBe("disk on fire");
    });

    expect.assertions(5);
  });

  it("is never softened by the invalid-data policy, which governs values rather than backends", async () => {
    const storage = createStorage({
      schema,
      adapter: failingAdapter("disk on fire"),
      onInvalid: "fallback",
    });

    await expect(storage.get("themeWithDefault")).rejects.toThrow(StorageAdapterError);
  });

  it("lets an error this library already raised through with its own type", async () => {
    const unavailable: StorageAdapter<string> = {
      name: "web",
      serializer: jsonSerializer,
      get: () => Promise.reject(new StorageUnavailableError({ adapter: "web", operation: "get" })),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    await expect(createStorage({ schema, adapter: unavailable }).get("theme")).rejects.toThrow(
      StorageUnavailableError,
    );
  });
});

describe("options", () => {
  it("uses a serializer given in place of the adapter's", async () => {
    const adapter = memoryAdapter();
    const calls: Array<string> = [];
    const storage = createStorage({
      schema,
      adapter,
      serializer: {
        serialize: (value) => {
          calls.push("serialize");
          return JSON.stringify(value);
        },
        deserialize: (wire) => JSON.parse(wire),
      },
    });

    await storage.set("theme", "dark");

    expect(calls).toEqual(["serialize"]);
    expect(await storage.get("theme")).toBe("dark");
  });

  it("reports every failure to the observer, including ones it went on to handle", async () => {
    const onError = vi.fn();
    const adapter = memoryAdapter({ initial: { theme: '"purple"' } });
    const storage = createStorage({ schema, adapter, onError });

    expect(await storage.get("theme")).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(StorageValidationError);
  });

  it("reports a thrown failure to the observer as well", async () => {
    const onError = vi.fn();
    const storage = createStorage({ schema, adapter: memoryAdapter(), onError });

    await expect(storage.set("theme", "purple" as never)).rejects.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("exposes the schema and adapter it was built with", () => {
    const { adapter, storage } = build();

    expect(storage.schema).toBe(schema);
    expect(storage.adapter).toBe(adapter);
  });
});

describe("a backend that transports JSON values", () => {
  const jsonSchema = defineStorageSchema({ nullableName: { schema: nullableNameSchema } });

  it("reads a stored null back as null, not as a key holding nothing", async () => {
    const storage = createStorage({ schema: jsonSchema, adapter: jsonValueAdapter() });

    await storage.set("nullableName", null);

    expect(await storage.get("nullableName")).toBeNull();
    expect(storage.getSync("nullableName")).toBeNull();
    expect(await storage.has("nullableName")).toBe(true);
  });

  it("stores the value untouched rather than as text", async () => {
    const adapter = jsonValueAdapter();
    const storage = createStorage({ schema: jsonSchema, adapter });

    await storage.set("nullableName", "ada");

    expect(adapter.getSync("nullableName")).toBe("ada");
  });
});

describe("a backend with no presence check", () => {
  const bareSchema = defineStorageSchema({ theme: { schema: themeSchema } });

  it("derives presence from a read, since `has` is optional on the contract", async () => {
    const adapter = adapterWithoutPresenceCheck("bare");
    const storage = createStorage({ schema: bareSchema, adapter });

    expect(await storage.has("theme")).toBe(false);
    expect(storage.hasSync("theme")).toBe(false);

    await storage.set("theme", "dark");

    expect(await storage.has("theme")).toBe(true);
    expect(storage.hasSync("theme")).toBe(true);
  });
});

function refusing(
  initial: Record<string, string>,
  refused: "set" | "remove",
): ReturnType<typeof recordingAdapter> {
  return {
    ...recordingAdapter(initial),
    [refused]: () => Promise.reject(new Error("refused")),
  };
}

/* Holds the read of `name` open after it has seen what is stored, so a write can land before the read acts on what it saw. */
function pausedRead(
  initial: Record<string, string>,
  name: string,
): { adapter: ReturnType<typeof recordingAdapter>; paused: ReturnType<typeof gate> } {
  const paused = gate();
  let held = false;
  const adapter = recordingAdapter(initial, (call) => {
    if (call !== `get ${name}` || held) return undefined;
    held = true;

    return paused.opened;
  });

  return { adapter, paused };
}

describe("a key that used to be stored under another name", () => {
  const renamed = defineStorageSchema({
    theme: { schema: themeSchema, key: "app:theme", readFrom: ["theme", "ancient"] },
    plain: { schema: themeSchema },
  });

  it("moves a value it finds under an old name and returns it", async () => {
    const adapter = recordingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema: renamed, adapter });

    await expect(storage.get("theme")).resolves.toBe("dark");

    expect(Object.fromEntries(adapter.entries)).toEqual({ "app:theme": '"dark"' });
  });

  it("moves on the synchronous path too", () => {
    const adapter = memoryAdapter({ initial: { ancient: '"dark"' } });
    const storage = createStorage({ schema: renamed, adapter });

    expect(storage.getSync("theme")).toBe("dark");
    expect(Object.fromEntries(adapter.entries)).toEqual({ "app:theme": '"dark"' });
  });

  it("tries the old names in order and clears them all once one is found", async () => {
    const adapter = recordingAdapter({ theme: '"dark"', ancient: '"light"' });
    const storage = createStorage({ schema: renamed, adapter });

    await expect(storage.get("theme")).resolves.toBe("dark");

    expect(Object.fromEntries(adapter.entries)).toEqual({ "app:theme": '"dark"' });
  });

  it("prefers the current name and looks no further", async () => {
    const adapter = recordingAdapter({ "app:theme": '"light"', theme: '"dark"' });
    const storage = createStorage({ schema: renamed, adapter });

    await expect(storage.get("theme")).resolves.toBe("light");

    expect(adapter.calls).toEqual(["get app:theme"]);
  });

  it("spends nothing extra on a key with no old names", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({ schema: renamed, adapter });

    await storage.get("plain");

    expect(adapter.calls).toEqual(["get plain"]);
  });

  it("reads as missing when no name holds anything", async () => {
    const storage = createStorage({ schema: renamed, adapter: recordingAdapter() });

    await expect(storage.get("theme")).resolves.toBeUndefined();
  });

  it("copies the stored form, so a schema whose output is not its input still reads it next time", async () => {
    const adapter = recordingAdapter({ old: '"5"' });
    const transforming = defineStorageSchema({
      amount: { schema: z.string().transform(Number), key: "new", readFrom: ["old"] },
    });
    const storage = createStorage({ schema: transforming, adapter });

    await expect(storage.get("amount")).resolves.toBe(5);
    await expect(storage.get("amount")).resolves.toBe(5);
    expect(adapter.entries.get("new")).toBe('"5"');
  });

  it("moves through the synchronous methods where there are any, leaving no gap for setSync", async () => {
    const adapter = memoryAdapter({ initial: { theme: '"dark"' } });
    const setAsync = vi.spyOn(adapter, "set");
    const storage = createStorage({ schema: renamed, adapter });

    await expect(storage.get("theme")).resolves.toBe("dark");

    expect(setAsync).not.toHaveBeenCalled();
    expect(adapter.entries.get("app:theme")).toBe('"dark"');
  });

  it("clears an old name that holds a value again, even after clearing it once", async () => {
    const adapter = recordingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema: renamed, adapter });

    await storage.set("theme", "light");
    adapter.entries.delete("app:theme");
    adapter.entries.set("theme", '"dark"');

    await expect(storage.get("theme")).resolves.toBe("dark");

    expect(adapter.entries.has("theme")).toBe(false);
  });

  describe("when the old value is invalid", () => {
    it("falls back and leaves it where it is, naming the old key", async () => {
      const adapter = recordingAdapter({ theme: '"mauve"' });
      const onError = vi.fn();
      const storage = createStorage({ schema: renamed, adapter, onError });

      await expect(storage.get("theme")).resolves.toBeUndefined();

      expect(adapter.entries.get("theme")).toBe('"mauve"');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ physicalKey: "theme" }));
    });

    it("throws naming the old key under the throw policy", async () => {
      const adapter = recordingAdapter({ theme: '"mauve"' });
      const storage = createStorage({ schema: renamed, adapter, onInvalid: "throw" });

      await expect(storage.get("theme")).rejects.toThrow(
        expect.objectContaining({ physicalKey: "theme" }),
      );
    });

    it("hands a callback the old key", async () => {
      const adapter = recordingAdapter({ theme: '"mauve"' });
      const onInvalid = vi.fn(() => "light");
      const storage = createStorage({ schema: renamed, adapter });

      await expect(storage.get("theme", { onInvalid: onInvalid as never })).resolves.toBe("light");

      expect(onInvalid).toHaveBeenCalledWith(expect.objectContaining({ physicalKey: "theme" }));
    });

    it("removes only the invalid name under the remove policy, so a later one can still answer", async () => {
      const adapter = recordingAdapter({ theme: '"mauve"', ancient: '"dark"' });
      const storage = createStorage({ schema: renamed, adapter, onInvalid: "remove" });

      await expect(storage.get("theme")).resolves.toBeUndefined();
      expect(Object.fromEntries(adapter.entries)).toEqual({ ancient: '"dark"' });

      await expect(storage.get("theme")).resolves.toBe("dark");
    });

    it("removes on the synchronous path too", () => {
      const adapter = memoryAdapter({ initial: { theme: '"mauve"' } });
      const storage = createStorage({ schema: renamed, adapter, onInvalid: "remove" });

      expect(storage.getSync("theme")).toBeUndefined();
      expect(adapter.entries.size).toBe(0);
    });
  });

  it("clears old names when invalid data under the current name is removed, so none comes back", async () => {
    const adapter = recordingAdapter({ "app:theme": '"mauve"', theme: '"dark"' });
    const storage = createStorage({ schema: renamed, adapter, onInvalid: "remove" });

    await expect(storage.get("theme")).resolves.toBeUndefined();

    expect(adapter.entries.size).toBe(0);
  });

  describe("when moving fails", () => {
    it("still returns the value, reports, and keeps the old one", async () => {
      const adapter = refusing({ theme: '"dark"' }, "set");
      const onError = vi.fn();
      const storage = createStorage({ schema: renamed, adapter, onError });

      await expect(storage.get("theme")).resolves.toBe("dark");

      expect(onError).toHaveBeenCalledOnce();
      expect(adapter.entries.get("theme")).toBe('"dark"');
    });

    it("still returns the value on the synchronous path", () => {
      const adapter = {
        ...memoryAdapter({ initial: { theme: '"dark"' } }),
        setSync: () => {
          throw new Error("refused");
        },
      };
      const storage = createStorage({ schema: renamed, adapter });

      expect(storage.getSync("theme")).toBe("dark");
      expect(adapter.entries.get("theme")).toBe('"dark"');
    });

    it("keeps the moved value when only the tidying up fails", async () => {
      const adapter = refusing({ theme: '"dark"' }, "remove");
      const storage = createStorage({ schema: renamed, adapter });

      await expect(storage.get("theme")).resolves.toBe("dark");

      expect(adapter.entries.get("app:theme")).toBe('"dark"');
    });
  });

  describe("the other operations", () => {
    it("counts a value held only under an old name as present", async () => {
      const storage = createStorage({
        schema: renamed,
        adapter: memoryAdapter({ initial: { ancient: '"dark"' } }),
      });

      await expect(storage.has("theme")).resolves.toBe(true);
      expect(storage.hasSync("theme")).toBe(true);
    });

    it("reports absence when no name holds anything", async () => {
      const storage = createStorage({ schema: renamed, adapter: memoryAdapter() });

      await expect(storage.has("theme")).resolves.toBe(false);
    });

    it("does not bring a value back after remove", async () => {
      const adapter = recordingAdapter({ theme: '"dark"' });
      const storage = createStorage({ schema: renamed, adapter });

      await storage.remove("theme");

      await expect(storage.get("theme")).resolves.toBeUndefined();
    });

    it("removes old names first, so stopping halfway cannot bring one back", async () => {
      const adapter = recordingAdapter();
      const storage = createStorage({ schema: renamed, adapter });

      await storage.remove("theme");

      expect(adapter.calls).toEqual(["remove theme", "remove ancient", "remove app:theme"]);
    });

    it("clears old names along with the declared keys", () => {
      const adapter = memoryAdapter({ initial: { theme: '"dark"', ancient: '"light"' } });
      const storage = createStorage({ schema: renamed, adapter });

      storage.clearSync();

      expect(adapter.entries.size).toBe(0);
    });

    it("clears old names when a value is written, and checks only once", async () => {
      const adapter = recordingAdapter({ theme: '"dark"' });
      const storage = createStorage({ schema: renamed, adapter });

      await storage.set("theme", "light");
      await storage.set("theme", "dark");

      expect(adapter.calls).toEqual([
        "set app:theme",
        "remove theme",
        "remove ancient",
        "set app:theme",
      ]);
    });

    it("keeps a write that succeeded when clearing old names fails, and tries again next time", async () => {
      const refusals = refusing({ theme: '"dark"' }, "remove");
      const storage = createStorage({ schema: renamed, adapter: refusals });

      await expect(storage.set("theme", "light")).resolves.toBeUndefined();
      await expect(storage.set("theme", "dark")).resolves.toBeUndefined();

      expect(refusals.entries.get("app:theme")).toBe('"dark"');
      expect(refusals.calls.filter((call) => call.startsWith("set"))).toHaveLength(2);
    });

    it("clears old names when a write stores nothing", async () => {
      const optional = defineStorageSchema({
        nickname: { schema: nicknameSchema, key: "new", readFrom: ["old"] },
      });
      const adapter = recordingAdapter({ old: '"x"' });
      const storage = createStorage({ schema: optional, adapter });

      await storage.set("nickname", undefined);

      expect(adapter.entries.size).toBe(0);
    });
  });

  describe("races", () => {
    it("does not overwrite a set that landed during a move", async () => {
      const { adapter, paused } = pausedRead({ theme: '"dark"' }, "theme");
      const storage = createStorage({ schema: renamed, adapter });

      const read = storage.get("theme");
      await vi.waitFor(() => {
        expect(adapter.calls).toContain("get theme");
      });
      await storage.set("theme", "light");
      paused.open();
      await read;

      expect(adapter.entries.get("app:theme")).toBe('"light"');
    });

    it("does not move over a value written while an old name could not be cleared", async () => {
      const { adapter, paused } = pausedRead({ theme: '"dark"' }, "theme");
      const stubborn = {
        ...adapter,
        remove: (key: string) =>
          key === "theme" ? Promise.reject(new Error("refused")) : adapter.remove(key),
      };
      const storage = createStorage({ schema: renamed, adapter: stubborn });

      const read = storage.get("theme");
      await vi.waitFor(() => {
        expect(adapter.calls).toContain("get theme");
      });
      await storage.set("theme", "light");
      paused.open();
      await read;

      expect(adapter.entries.get("app:theme")).toBe('"light"');
    });

    it("does not remove a valid value that replaced the invalid one it read", async () => {
      const { adapter, paused } = pausedRead({ plain: '"mauve"' }, "plain");
      const storage = createStorage({ schema: renamed, adapter, onInvalid: "remove" });

      const read = storage.get("plain");
      await vi.waitFor(() => {
        expect(adapter.calls).toContain("get plain");
      });
      await storage.set("plain", "dark");
      paused.open();
      await read;

      expect(adapter.entries.get("plain")).toBe('"dark"');
    });
  });
});

describe("writes to one key", () => {
  it("lets a read see the writes started before it", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: themeSchema } }),
      adapter,
    });

    void storage.set("theme", "light");
    void storage.set("theme", "dark");

    await expect(storage.get("theme")).resolves.toBe("dark");
  });

  it("makes has wait for them as well", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: themeSchema } }),
      adapter,
    });

    void storage.set("theme", "light");

    await expect(storage.has("theme")).resolves.toBe(true);
  });

  it("keeps their order when a validator answers later for the earlier one", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ text: { schema: slowerWhenLongerSchema } }),
      adapter,
    });

    await Promise.all([storage.set("text", "a long value"), storage.set("text", "b")]);

    expect(adapter.entries.get("text")).toBe('"b"');
  });

  it("puts a write started after clear behind it, on every key", async () => {
    const adapter = recordingAdapter({ first: '"light"', second: '"light"' });
    const storage = createStorage({
      schema: defineStorageSchema({
        first: { schema: themeSchema },
        second: { schema: themeSchema },
      }),
      adapter,
    });

    await Promise.all([storage.clear(), storage.set("second", "dark")]);

    expect(adapter.entries.get("second")).toBe('"dark"');
  });

  it("puts a read started after clear behind it, on every key", async () => {
    const adapter = recordingAdapter({ first: '"light"', second: '"light"' });
    const storage = createStorage({
      schema: defineStorageSchema({
        first: { schema: themeSchema },
        second: { schema: themeSchema },
      }),
      adapter,
    });

    void storage.clear();

    await expect(storage.get("second")).resolves.toBeUndefined();
  });

  it("stops clearing at the first key the backend refuses", async () => {
    const adapter = recordingAdapter({ first: '"light"', second: '"light"' });
    const storage = createStorage({
      schema: defineStorageSchema({
        first: { schema: themeSchema },
        second: { schema: themeSchema },
      }),
      adapter: { ...adapter, remove: () => Promise.reject(new Error("refused")) },
    });

    await expect(storage.clear()).rejects.toThrow(
      expect.objectContaining({ physicalKey: "first" }),
    );

    expect(adapter.entries.size).toBe(2);
  });

  it("carries on after one of them fails", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: themeSchema } }),
      adapter,
    });

    const refused = storage.set("theme", "mauve" as never);
    const accepted = storage.set("theme", "dark");

    await expect(refused).rejects.toThrow(StorageValidationError);
    await accepted;

    expect(adapter.entries.get("theme")).toBe('"dark"');
  });
});

function pushInPlace(current: Array<string>): Array<string> {
  current.push("x");

  return current;
}

function failAfterChangingTags(current: { tags: Array<string> }): never {
  current.tags.push("b");
  throw new Error("canceled");
}

function replaceDateDefault(current: { when: Date | string }): { when: string } {
  expect(current.when).toBeInstanceOf(Date);
  if (!(current.when instanceof Date)) throw new Error("expected a date");
  current.when.setUTCFullYear(2025);
  return { when: current.when.toISOString() };
}

describe("update", () => {
  const counters = defineStorageSchema({
    count: { schema: z.number(), default: 0 },
    moved: { schema: z.number(), default: 0, key: "new", readFrom: ["old"] },
    nickname: { schema: nicknameSchema },
    text: { schema: asyncStringSchema },
    theme: { schema: themeSchema },
  });

  it("works out the next value from the current one", async () => {
    const adapter = recordingAdapter({ count: "4" });
    const storage = createStorage({ schema: counters, adapter });

    await storage.update("count", (current) => current + 1);

    expect(adapter.entries.get("count")).toBe("5");
  });

  it("hands the updater the default when nothing is stored", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({ schema: counters, adapter });

    await storage.update("count", (current) => current + 1);

    expect(adapter.entries.get("count")).toBe("1");
  });

  it("loses neither of two updates started together", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({ schema: counters, adapter });

    await Promise.all([
      storage.update("count", (current) => current + 1),
      storage.update("count", (current) => current + 1),
    ]);

    expect(adapter.entries.get("count")).toBe("2");
  });

  it("carries a value forward from an old name without waiting on itself", async () => {
    const adapter = recordingAdapter({ old: "4" });
    const storage = createStorage({ schema: counters, adapter });

    await storage.update("moved", (current) => current + 1);

    expect(Object.fromEntries(adapter.entries)).toEqual({ new: "5" });
  });

  it("writes through the synchronous methods where there are any", async () => {
    const adapter = memoryAdapter({ initial: { count: "1" } });
    const getAsync = vi.spyOn(adapter, "get");
    const storage = createStorage({ schema: counters, adapter });

    await storage.update("count", (current) => current + 1);

    expect(getAsync).not.toHaveBeenCalled();
    expect(adapter.entries.get("count")).toBe("2");
  });

  it("still accepts a validator that answers later over a synchronous backend", async () => {
    const adapter = memoryAdapter({ initial: { text: '"a"' } });
    const storage = createStorage({ schema: counters, adapter });

    await storage.update("text", (current) => `${String(current)}b`);

    expect(adapter.entries.get("text")).toBe('"ab"');
  });

  it("has a synchronous form", () => {
    const adapter = memoryAdapter({ initial: { count: "1" } });
    const storage = createStorage({ schema: counters, adapter });

    storage.updateSync("count", (current) => current + 1);

    expect(adapter.entries.get("count")).toBe("2");
  });

  it("writes nothing and does not report when the updater throws", async () => {
    const adapter = recordingAdapter({ count: "1" });
    const onError = vi.fn();
    const storage = createStorage({ schema: counters, adapter, onError });

    await expect(
      storage.update("count", () => {
        throw new Error("changed my mind");
      }),
    ).rejects.toThrow("changed my mind");

    expect(adapter.entries.get("count")).toBe("1");
    expect(onError).not.toHaveBeenCalled();
  });

  it("refuses a next value the schema rejects, as set does", async () => {
    const storage = createStorage({ schema: counters, adapter: recordingAdapter() });

    await expect(storage.update("count", () => "nine" as never)).rejects.toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Validation,
        operation: STORAGE_OPERATION.Set,
      }),
    );
  });

  it("removes the entry when the next value is undefined", async () => {
    const adapter = recordingAdapter({ nickname: '"x"' });
    const storage = createStorage({ schema: counters, adapter });

    await storage.update("nickname", () => undefined);

    expect(adapter.entries.has("nickname")).toBe(false);
  });

  it("honors the throw policy for what it reads", async () => {
    const storage = createStorage({
      schema: counters,
      adapter: recordingAdapter({ theme: '"mauve"' }),
      onInvalid: "throw",
    });

    await expect(storage.update("theme", () => "dark")).rejects.toThrow(StorageValidationError);
  });

  it("replaces invalid data rather than removing it first", async () => {
    const adapter = recordingAdapter({ theme: '"mauve"' });
    const storage = createStorage({ schema: counters, adapter, onInvalid: "remove" });

    await storage.update("theme", () => "dark");

    expect(adapter.calls).toEqual(["get theme", "set theme"]);
  });

  describe("an updater changing what it receives in place", () => {
    const withDefault = defineStorageSchema({
      tags: { schema: tagsSchema, default: [] },
    });

    it("leaves the declared default as it was", async () => {
      const storage = createStorage({ schema: withDefault, adapter: recordingAdapter() });

      await storage.update("tags", pushInPlace);
      await storage.remove("tags");

      await expect(storage.get("tags")).resolves.toEqual([]);
    });

    it("leaves it as it was over a backend that hands objects straight through", async () => {
      const storage = createStorage({ schema: withDefault, adapter: jsonValueAdapter() });

      await storage.update("tags", pushInPlace);
      await storage.remove("tags");

      await expect(storage.get("tags")).resolves.toEqual([]);
    });

    it.each(["async", "sync"] as const)(
      "keeps stored objects unchanged when the %s updater throws",
      async (mode) => {
        const adapter = memoryAdapter({
          serializer: passthroughSerializer,
          initial: { items: { tags: ["a"] } },
        });
        const onError = vi.fn();
        const storage = createStorage({
          schema: defineStorageSchema({
            items: { schema: z.custom<{ tags: Array<string> }>(), default: { tags: [] } },
          }),
          adapter,
          onError,
        });
        if (mode === "async") {
          await expect(storage.update("items", failAfterChangingTags)).rejects.toThrow("canceled");
        } else {
          expect(() => storage.updateSync("items", failAfterChangingTags)).toThrow("canceled");
        }

        expect(adapter.entries.get("items")).toEqual({ tags: ["a"] });
        expect(onError).not.toHaveBeenCalled();
      },
    );

    it("keeps stored objects unchanged when validation rejects a mutated result", async () => {
      const adapter = memoryAdapter({
        serializer: passthroughSerializer,
        initial: { items: ["a"] },
      });
      const storage = createStorage({
        schema: defineStorageSchema({
          items: {
            schema: z.custom<Array<string>>((value) => Array.isArray(value) && value.length < 2),
            default: [],
          },
        }),
        adapter,
      });

      await expect(storage.update("items", pushInPlace)).rejects.toThrow(StorageValidationError);

      expect(adapter.entries.get("items")).toEqual(["a"]);
    });

    it("stores a successful in-place update without changing the object it read", async () => {
      const initial = ["a"];
      const adapter = memoryAdapter({
        serializer: passthroughSerializer,
        initial: { items: initial },
      });
      const storage = createStorage({
        schema: defineStorageSchema({ items: { schema: z.custom<Array<string>>(), default: [] } }),
        adapter,
      });

      await storage.update("items", pushInPlace);

      expect(adapter.entries.get("items")).toEqual(["a", "x"]);
      expect(initial).toEqual(["a"]);
    });

    it("isolates a shared invalid-data replacement when the updater throws", async () => {
      const replacement = { tags: ["a"] };
      const adapter = memoryAdapter({ initial: { items: '"invalid"' } });
      const storage = createStorage({
        schema: defineStorageSchema({
          items: { schema: z.object({ tags: z.array(z.string()) }), default: { tags: [] } },
        }),
        adapter,
        onInvalid: () => replacement,
      });

      await expect(storage.update("items", failAfterChangingTags)).rejects.toThrow("canceled");

      expect(replacement).toEqual({ tags: ["a"] });
      expect(adapter.entries.get("items")).toBe('"invalid"');
    });

    it("keeps stored objects unchanged when serialization rejects a mutated result", async () => {
      const adapter = memoryAdapter({
        serializer: passthroughSerializer,
        initial: { items: { count: 1 } },
      });
      const storage = createStorage({
        schema: defineStorageSchema({
          items: { schema: z.custom<{ count: number | bigint }>(), default: { count: 0 } },
        }),
        adapter,
      });

      await expect(
        storage.update("items", (current) => {
          current.count = 1n;
          return current;
        }),
      ).rejects.toThrow(StorageSerializationError);

      expect(adapter.entries.get("items")).toEqual({ count: 1 });
    });

    it.each(["async", "sync"] as const)(
      "preserves date defaults for the %s updater",
      async (mode) => {
        const when = new Date("2020-01-01");
        const storage = createStorage({
          schema: defineStorageSchema({
            value: {
              schema: z.object({ when: z.union([z.date(), z.string()]) }),
              default: { when },
            },
          }),
          adapter: memoryAdapter(),
        });
        if (mode === "async") await storage.update("value", replaceDateDefault);
        else storage.updateSync("value", replaceDateDefault);

        expect(when.getUTCFullYear()).toBe(2020);
        expect(storage.getSync("value")).toEqual({ when: "2025-01-01T00:00:00.000Z" });
      },
    );

    it("lets an updater replace a default that the serializer cannot store", async () => {
      const onError = vi.fn();
      const serializer = {
        serialize: vi.fn(jsonSerializer.serialize),
        deserialize: vi.fn(jsonSerializer.deserialize),
      };
      const storage = createStorage({
        schema: defineStorageSchema({
          value: {
            schema: z.object({ amount: z.union([z.bigint(), z.number()]) }),
            default: { amount: 1n },
          },
        }),
        adapter: memoryAdapter(),
        serializer,
        onError,
      });

      await storage.update("value", (current) => ({ amount: Number(current.amount) + 1 }));

      expect(serializer.serialize).toHaveBeenCalledExactlyOnceWith({ amount: 2 });
      expect(serializer.deserialize).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(storage.getSync("value")).toEqual({ amount: 2 });
    });

    it("still updates a key holding something it cannot copy", async () => {
      class Money {
        readonly cents: number;

        constructor(cents: number) {
          this.cents = cents;
        }
      }

      const storage = createStorage({
        schema: defineStorageSchema({
          price: {
            schema: z.custom<Money>((value) => value instanceof Money),
            default: new Money(1),
          },
        }),
        adapter: memoryAdapter(),
        serializer: {
          serialize: (value) => JSON.stringify((value as Money).cents),
          deserialize: (wire) => new Money(JSON.parse(wire) as number),
        },
      });

      await storage.update("price", (current) => new Money(current.cents + 1));

      expect(storage.getSync("price")).toEqual(new Money(2));
    });

    it("reports a default that cannot be stored", async () => {
      const onError = vi.fn();
      const storage = createStorage({
        schema: defineStorageSchema({ wild: { schema: anythingSchema, default: { a: 1n } } }),
        adapter: recordingAdapter(),
        onError,
      });

      await expect(storage.update("wild", (current) => current)).rejects.toThrow(
        StorageSerializationError,
      );
      expect(onError).toHaveBeenCalledOnce();
    });
  });

  it("rejects a key the schema does not declare", async () => {
    const storage = createStorage({ schema: counters, adapter: recordingAdapter() });

    await expect(storage.update("nope" as never, () => undefined as never)).rejects.toThrow(
      UnknownStorageKeyError,
    );
  });
});
