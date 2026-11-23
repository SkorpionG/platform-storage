import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  isSyncStorageAdapter,
  jsonSerializer,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageUnavailableError,
  StorageValidationError,
} from "../index";
import { asyncStorageAdapter } from "../async-storage-adapter";
import type { AsyncStorageLike } from "../types";
import { fakeAsyncStorage, rejectingAsyncStorage } from "../../tests/fakes/fake-async-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  nullableName: { schema: z.string().nullable() },
});

describe("asyncStorageAdapter", () => {
  it("answers only asynchronously, so a storage over it has no synchronous half", () => {
    expect(isSyncStorageAdapter(asyncStorageAdapter(fakeAsyncStorage()))).toBe(false);
  });

  it("transports JSON text, since AsyncStorage holds only strings", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).serializer).toBe(jsonSerializer);
  });

  it("writes to and reads from the storage it is given", async () => {
    const storage = fakeAsyncStorage();
    const adapter = asyncStorageAdapter(storage);

    await adapter.set("theme", '"dark"');

    expect(storage.entries.get("theme")).toBe('"dark"');
    expect(await adapter.get("theme")).toBe('"dark"');
  });

  it("reports a missing key as undefined, where AsyncStorage itself says null", async () => {
    expect(await asyncStorageAdapter(fakeAsyncStorage()).get("absent")).toBeUndefined();
  });

  it("reaches the instance in the order it was called", async () => {
    const adapter = asyncStorageAdapter(fakeAsyncStorage());

    const writing = adapter.set("theme", '"dark"');
    const reading = adapter.get("theme");
    await writing;

    expect(await reading).toBe('"dark"');
  });

  it("removes a key", async () => {
    const storage = fakeAsyncStorage({ theme: '"dark"' });
    const adapter = asyncStorageAdapter(storage);

    await adapter.remove("theme");

    expect(storage.entries.has("theme")).toBe(false);
  });

  it("takes a name, which errors then report", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).name).toBe("AsyncStorage");
    expect(asyncStorageAdapter(fakeAsyncStorage(), { name: "device" }).name).toBe("device");
  });
});

describe("a storage that rejects", () => {
  it("becomes an adapter error through a storage, keeping the rejection as the cause", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(rejectingAsyncStorage("disk full")),
    });

    await expect(storage.set("theme", "dark")).rejects.toThrow(StorageAdapterError);
    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
      adapter: "AsyncStorage",
      operation: "set",
      physicalKey: "theme",
      cause: expect.objectContaining({ message: "disk full" }),
    });
  });

  it("is never softened by the invalid-data policy, which governs values rather than backends", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(rejectingAsyncStorage("disk full")),
      onInvalid: "fallback",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageAdapterError);
  });

  /*
    The web and extension adapters raise `StorageQuotaExceededError` for a backend that has run out of room, because each of those platforms names the case. AsyncStorage does not: what a full device produces depends on the native layer underneath, and there is no signal that means the same thing on both iOS and Android. Guessing from a message would be wrong more often than right, so the failure keeps the general code and the rejection itself stays reachable through `cause`.
  */
  it("reports a full device as a plain adapter failure, since nothing here can tell one apart", async () => {
    const cause = new Error("SQLITE_FULL: database or disk is full");
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(rejectingAsyncStorage(cause.message)),
    });

    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
    });
    await expect(storage.set("theme", "dark")).rejects.not.toMatchObject({
      code: STORAGE_ERROR_CODE.Quota,
    });
  });
});

describe("through a storage", () => {
  it("keeps a stored null apart from a key that holds nothing", async () => {
    const storage = createStorage({ schema, adapter: asyncStorageAdapter(fakeAsyncStorage()) });

    await storage.set("nullableName", null);

    expect(await storage.get("nullableName")).toBeNull();
    expect(await storage.has("nullableName")).toBe(true);

    await storage.remove("nullableName");

    expect(await storage.get("nullableName")).toBeUndefined();
    expect(await storage.has("nullableName")).toBe(false);
  });

  it("falls back when what is stored no longer matches the schema", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(fakeAsyncStorage({ theme: '"purple"' })),
    });

    expect(await storage.get("theme")).toBe("light");
  });

  it("falls back when what is stored is not JSON at all, as a value written by other code may not be", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(fakeAsyncStorage({ theme: "dark" })),
    });

    expect(await storage.get("theme")).toBe("light");
  });

  it("throws instead where the storage asks it to", async () => {
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(fakeAsyncStorage({ theme: '"purple"' })),
      onInvalid: "throw",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
  });
});

describe("listing what the storage holds", () => {
  it("lists through getAllKeys where the storage has it, keeping its receiver", async () => {
    const asyncStorage = {
      ...fakeAsyncStorage(),
      names: ["theme", "user"],
      getAllKeys() {
        return Promise.resolve(this.names);
      },
    };

    await expect(asyncStorageAdapter(asyncStorage).keys?.()).resolves.toEqual(["theme", "user"]);
  });

  it("offers no listing where the storage has no getAllKeys", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).keys).toBeUndefined();
  });
});

describe("clearing the whole storage", () => {
  it("clears through the storage's own clear, keeping its receiver", async () => {
    const asyncStorage = {
      ...fakeAsyncStorage({ theme: '"dark"', "someone-elses-key": "1" }),
      cleared: 0,
      clear(this: { cleared: number; entries: Map<string, string> }) {
        this.cleared += 1;
        this.entries.clear();

        return Promise.resolve();
      },
    };

    await asyncStorageAdapter(asyncStorage).clear?.();

    expect(asyncStorage.cleared).toBe(1);
    expect(asyncStorage.entries.size).toBe(0);
  });

  it("offers no clear where the storage has none, or there is no storage", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).clear).toBeUndefined();
    expect(asyncStorageAdapter(null).clear).toBeUndefined();
  });

  it("is what clear of everything calls, once, with no listing", async () => {
    const calls: Array<string> = [];
    const base = fakeAsyncStorage({ theme: '"dark"', "someone-elses-key": "1" });
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter({
        ...base,
        getAllKeys: () => {
          calls.push("getAllKeys");
          return Promise.resolve([...base.entries.keys()]);
        },
        clear: async () => {
          calls.push("clear");
          await Promise.all([...base.entries.keys()].map((key) => base.removeItem(key)));
        },
      }),
    });

    await storage.clear("everything");

    expect(calls).toEqual(["clear"]);
    expect(base.entries.size).toBe(0);
  });

  it("lets a refusal through for a storage to report as the clear operation", async () => {
    const onError = (error: unknown): void => {
      reported.push(error);
    };
    const reported: Array<unknown> = [];
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter({
        ...fakeAsyncStorage(),
        clear: () => Promise.reject(new Error("disk full")),
      }),
      onError,
    });

    await expect(storage.clear("everything")).rejects.toBeInstanceOf(StorageAdapterError);
    expect(reported).toEqual([expect.objectContaining({ operation: "clear" })]);
  });
});

describe("following changes", () => {
  it("offers no feed, because AsyncStorage reports nothing", () => {
    expect(asyncStorageAdapter(fakeAsyncStorage()).subscribe).toBeUndefined();
  });
});

/** An instance whose batch methods can only reach what they record through `this`. */
interface Recorder {
  readonly seen: Array<string>;
}

function noted(owner: Recorder, name: string): Promise<void> {
  owner.seen.push(name);

  return Promise.resolve();
}

async function exerciseBatches(instance: AsyncStorageLike & Recorder): Promise<void> {
  const adapter = asyncStorageAdapter(instance);

  await adapter.getMany?.(["a"]);
  await adapter.setMany?.(new Map([["a", "1"]]));
  await adapter.removeMany?.(["a"]);
}

describe("batches over AsyncStorage", () => {
  it("uses AsyncStorage 3's batch methods, leaving out names that answer null", async () => {
    const base = fakeAsyncStorage({ a: "1" });
    const calls: Array<string> = [];
    const adapter = asyncStorageAdapter({
      ...base,
      getMany(keys) {
        calls.push(`getMany ${keys.join(",")}`);

        return Promise.resolve(
          Object.fromEntries(keys.map((key) => [key, base.entries.get(key) ?? null])),
        );
      },
      setMany(entries) {
        calls.push(`setMany ${Object.keys(entries).join(",")}`);

        return Promise.resolve();
      },
      removeMany(keys) {
        calls.push(`removeMany ${keys.join(",")}`);

        return Promise.resolve();
      },
    });

    expect(await adapter.getMany?.(["a", "b"])).toEqual(new Map([["a", "1"]]));
    await adapter.setMany?.(new Map([["c", "3"]]));
    await adapter.removeMany?.(["a"]);

    expect(calls).toEqual(["getMany a,b", "setMany c", "removeMany a"]);
  });

  it("uses AsyncStorage 2's batch methods where those are what it has", async () => {
    const base = fakeAsyncStorage({ a: "1" });
    const calls: Array<string> = [];
    const adapter = asyncStorageAdapter({
      ...base,
      multiGet(keys) {
        calls.push(`multiGet ${keys.join(",")}`);

        return Promise.resolve(keys.map((key) => [key, base.entries.get(key) ?? null] as const));
      },
      multiSet(pairs) {
        calls.push(`multiSet ${pairs.map(([key]) => key).join(",")}`);

        return Promise.resolve();
      },
      multiRemove(keys) {
        calls.push(`multiRemove ${keys.join(",")}`);

        return Promise.resolve();
      },
    });

    expect(await adapter.getMany?.(["a", "b"])).toEqual(new Map([["a", "1"]]));
    await adapter.setMany?.(new Map([["c", "3"]]));
    await adapter.removeMany?.(["a"]);

    expect(calls).toEqual(["multiGet a,b", "multiSet c", "multiRemove a"]);
  });

  it("prefers AsyncStorage 3's methods when both are there", async () => {
    const calls: Array<string> = [];
    const adapter = asyncStorageAdapter({
      ...fakeAsyncStorage(),
      getMany: () => {
        calls.push("getMany");

        return Promise.resolve({});
      },
      multiGet: () => {
        calls.push("multiGet");

        return Promise.resolve([]);
      },
    });

    await adapter.getMany?.(["a"]);

    expect(calls).toEqual(["getMany"]);
  });

  it("keeps every batch method on its instance, since a method taken off it loses its receiver", async () => {
    const seen: Array<string> = [];

    await exerciseBatches({
      ...fakeAsyncStorage(),
      seen,
      getMany(this: Recorder) {
        return noted(this, "getMany").then(() => ({}));
      },
      setMany(this: Recorder) {
        return noted(this, "setMany");
      },
      removeMany(this: Recorder) {
        return noted(this, "removeMany");
      },
    });
    await exerciseBatches({
      ...fakeAsyncStorage(),
      seen,
      multiGet(this: Recorder) {
        return noted(this, "multiGet").then(() => []);
      },
      multiSet(this: Recorder) {
        return noted(this, "multiSet");
      },
      multiRemove(this: Recorder) {
        return noted(this, "multiRemove");
      },
    });

    expect(seen).toEqual([
      "getMany",
      "setMany",
      "removeMany",
      "multiGet",
      "multiSet",
      "multiRemove",
    ]);
  });

  it("offers no batch method for an instance with neither", () => {
    const adapter = asyncStorageAdapter(fakeAsyncStorage());

    expect(adapter.getMany).toBeUndefined();
    expect(adapter.setMany).toBeUndefined();
    expect(adapter.removeMany).toBeUndefined();
  });
});

describe("an instance that is not there", () => {
  it("says whether the instance has what every operation needs", () => {
    const { getItem, setItem, removeItem } = fakeAsyncStorage();

    expect(asyncStorageAdapter(fakeAsyncStorage()).isAvailable?.()).toBe(true);
    expect(asyncStorageAdapter({ getItem, setItem, removeItem }).isAvailable?.()).toBe(true);
    expect(
      asyncStorageAdapter({ getItem, setItem } as unknown as AsyncStorageLike).isAvailable?.(),
    ).toBe(false);
    expect(asyncStorageAdapter(null).isAvailable?.()).toBe(false);
    expect(asyncStorageAdapter(undefined).isAvailable?.()).toBe(false);
  });

  it("reports every operation as unavailable, naming the operation and the key, rather than failing on nothing", async () => {
    const adapter = asyncStorageAdapter(undefined, { name: "device" });

    await expect(adapter.get("theme")).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(adapter.set("theme", '"dark"')).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unavailable,
      adapter: "device",
      operation: "set",
      physicalKey: "theme",
    });
    await expect(adapter.remove("theme")).rejects.toMatchObject({ operation: "remove" });
  });

  it("offers no batch methods, and a listing that reports itself unavailable", async () => {
    const adapter = asyncStorageAdapter(null);

    expect(adapter.getMany).toBeUndefined();
    expect(adapter.setMany).toBeUndefined();
    expect(adapter.removeMany).toBeUndefined();
    await expect(adapter.keys?.()).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unavailable,
      operation: "keys",
    });
  });

  it("treats an instance lacking one of the three methods as not there", async () => {
    const { setItem, removeItem, getAllKeys, getMany } = fakeAsyncStorage();
    const partial = { setItem, removeItem, getAllKeys, getMany } as unknown as AsyncStorageLike;
    const adapter = asyncStorageAdapter(partial);

    await expect(adapter.get("theme")).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(adapter.getMany).toBeUndefined();
    await expect(adapter.keys?.()).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it("reaches a storage over it as unavailable, through onError", async () => {
    const codes: Array<string> = [];
    const storage = createStorage({
      schema,
      adapter: asyncStorageAdapter(null),
      onError: (error) => codes.push(error.code),
    });

    await expect(storage.get("theme")).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(codes).toEqual([STORAGE_ERROR_CODE.Unavailable]);
  });
});
