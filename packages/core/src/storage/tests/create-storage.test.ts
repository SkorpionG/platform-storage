import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  jsonSerializer,
  memoryAdapter,
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
  countSchema,
  nicknameSchema,
  nullableNameSchema,
  tagsSchema,
  themeSchema,
  userSchema,
} from "../../../tests/fixtures/schemas";
import {
  adapterWithoutPresenceCheck,
  failingAdapter,
  jsonValueAdapter,
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
