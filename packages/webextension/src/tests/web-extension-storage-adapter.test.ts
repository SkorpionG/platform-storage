import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  isSyncStorageAdapter,
  passthroughSerializer,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageUnavailableError,
  StorageValidationError,
} from "../index";
import { webExtensionStorageAdapter } from "../web-extension-storage-adapter";
import {
  fakeStorageNamespace,
  fullStorageArea,
  rejectingStorageArea,
} from "../../tests/fakes/fake-web-extension-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  nullableName: { schema: z.string().nullable() },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webExtensionStorageAdapter", () => {
  it("answers only asynchronously, so a storage over it has no synchronous half", () => {
    const adapter = webExtensionStorageAdapter({ storage: () => fakeStorageNamespace() });

    expect(isSyncStorageAdapter(adapter)).toBe(false);
  });

  it("hands values over untouched, since the area stores JSON values natively", () => {
    const adapter = webExtensionStorageAdapter({ storage: () => fakeStorageNamespace() });

    expect(adapter.serializer).toBe(passthroughSerializer);
  });

  it("stores an object as an object, not as text", async () => {
    const storage = fakeStorageNamespace();
    const adapter = webExtensionStorageAdapter({ storage: () => storage });

    await adapter.set("app:user", { id: "u1", name: "Ada" });

    expect(storage.local.entries.get("app:user")).toEqual({ id: "u1", name: "Ada" });
    expect(await adapter.get("app:user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("reports a missing key as undefined, since the area leaves it out of its answer", async () => {
    const storage = fakeStorageNamespace();
    const adapter = webExtensionStorageAdapter({ storage: () => storage });

    expect(await adapter.get("absent")).toBeUndefined();
  });

  it("keeps a stored null apart from a key that holds nothing", async () => {
    const storage = fakeStorageNamespace();
    const adapter = webExtensionStorageAdapter({ storage: () => storage });

    await adapter.set("nullableName", null);

    expect(await adapter.get("nullableName")).toBeNull();
    expect(storage.local.entries.get("nullableName")).toBeNull();
  });

  it("removes a key", async () => {
    const storage = fakeStorageNamespace();
    const adapter = webExtensionStorageAdapter({ storage: () => storage });

    await adapter.set("theme", "dark");
    await adapter.remove("theme");

    expect(storage.local.entries.has("theme")).toBe(false);
  });

  it("addresses the area it was given, and local when given none", async () => {
    const storage = fakeStorageNamespace();

    await webExtensionStorageAdapter({ storage: () => storage }).set("theme", "dark");
    await webExtensionStorageAdapter({ storage: () => storage, area: "sync" }).set(
      "theme",
      "light",
    );

    expect(storage.local.entries.get("theme")).toBe("dark");
    expect(storage.sync.entries.get("theme")).toBe("light");
    expect(storage.session?.entries.size).toBe(0);
  });

  it("resolves the namespace on every operation rather than once", async () => {
    const adapter = webExtensionStorageAdapter();

    await expect(adapter.get("theme")).rejects.toThrow(StorageUnavailableError);

    const storage = fakeStorageNamespace();
    vi.stubGlobal("chrome", { storage });
    await adapter.set("theme", "dark");

    expect(storage.local.entries.get("theme")).toBe("dark");
  });

  it("is named after its area, which errors then report", () => {
    expect(webExtensionStorageAdapter().name).toBe("storage.local");
    expect(webExtensionStorageAdapter({ area: "sync" }).name).toBe("storage.sync");
    expect(webExtensionStorageAdapter({ area: "session" }).name).toBe("storage.session");
    expect(webExtensionStorageAdapter({ name: "settings" }).name).toBe("settings");
  });
});

describe("an API that is not there", () => {
  it("is reported as unavailable, naming the adapter, the operation and the key", async () => {
    const adapter = webExtensionStorageAdapter();

    await expect(adapter.get("theme")).rejects.toThrow(StorageUnavailableError);
    await expect(adapter.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unavailable,
      adapter: "storage.local",
      operation: "set",
      physicalKey: "theme",
    });
  });

  it("reports a missing area the same way, as session is on Manifest V2", async () => {
    const adapter = webExtensionStorageAdapter({
      storage: () => fakeStorageNamespace({ session: false }),
      area: "session",
    });

    await expect(adapter.get("theme")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unavailable,
      adapter: "storage.session",
    });
  });

  it("rejects rather than throwing, so an awaiting caller never needs try", async () => {
    const adapter = webExtensionStorageAdapter();

    // Reaching for the area fails before any promise exists. Holding the results before awaiting them is what proves that failure arrives as a rejection rather than escaping these calls.
    const read = adapter.get("theme");
    const removal = adapter.remove("theme");

    await expect(read).rejects.toThrow(StorageUnavailableError);
    await expect(removal).rejects.toThrow(StorageUnavailableError);
  });

  it("keeps its own error type through a storage, rather than being wrapped again", async () => {
    const storage = createStorage({ schema, adapter: webExtensionStorageAdapter() });

    await expect(storage.get("theme")).rejects.toThrow(StorageUnavailableError);
  });

  it("says so from its probe, without touching the area", () => {
    expect(webExtensionStorageAdapter().isAvailable?.()).toBe(false);
    expect(
      webExtensionStorageAdapter({ storage: () => fakeStorageNamespace() }).isAvailable?.(),
    ).toBe(true);
    expect(
      webExtensionStorageAdapter({
        storage: () => fakeStorageNamespace({ session: false }),
        area: "session",
      }).isAvailable?.(),
    ).toBe(false);
    expect(
      webExtensionStorageAdapter({
        storage: () => {
          throw new Error("no api");
        },
      }).isAvailable?.(),
    ).toBe(false);
  });
});

describe("an area that rejects", () => {
  it("becomes an adapter error through a storage, keeping the browser's rejection as the cause", async () => {
    const namespace = {
      ...fakeStorageNamespace(),
      sync: rejectingStorageArea("This extension has no storage permission."),
    };
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toThrow(StorageAdapterError);
    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
      adapter: "storage.sync",
      operation: "set",
      physicalKey: "theme",
      cause: expect.objectContaining({ message: "This extension has no storage permission." }),
    });
  });
});

/*
  An area reports a full quota by naming the limit that was passed rather than with an error type of its own, so reading the message is the only way to tell one apart. The `sync` area has the tightest limits and is where this is met first.
*/
describe("a full area", () => {
  const limits = [
    ["the area's total", "QUOTA_BYTES quota exceeded"],
    ["one item's share", "QUOTA_BYTES_PER_ITEM quota exceeded"],
    ["the number of items", "MAX_ITEMS quota exceeded"],
    ["the write rate", "MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded"],
    ["a differently worded sentence", "Quota exceeded: quota_bytes"],
  ] as const;

  it.each(limits)("is recognized when the browser names %s", async (_label, message) => {
    const namespace = { ...fakeStorageNamespace(), sync: fullStorageArea(message) };
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Quota,
      adapter: "storage.sync",
      operation: "set",
      physicalKey: "theme",
    });
  });

  /* A browser is not obliged to reject with an `Error`, and a bare string carries the same message. */
  it("is recognized when the browser rejects with a bare string", async () => {
    const namespace = {
      ...fakeStorageNamespace(),
      sync: { ...fakeStorageNamespace().sync, set: () => Promise.reject("QUOTA_BYTES exceeded") },
    };
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Quota,
    });
  });

  it("is not claimed for a rejection that says nothing about room", async () => {
    const namespace = {
      ...fakeStorageNamespace(),
      sync: rejectingStorageArea("The browser is offline."),
    };
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
    });
  });

  /* A rejection carrying no message at all has nothing to read, so it cannot be claimed either. */
  it("is not claimed for a rejection with no message to read", async () => {
    const namespace = {
      ...fakeStorageNamespace(),
      sync: { ...fakeStorageNamespace().sync, set: () => Promise.reject({ code: 500 }) },
    };
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
    });
  });

  it("is still an adapter failure, so anything catching those still catches it", async () => {
    const namespace = { ...fakeStorageNamespace(), sync: fullStorageArea("QUOTA_BYTES exceeded") };
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toBeInstanceOf(StorageAdapterError);
  });

  it("leaves reads and removes alone, since only a write can run out of room", async () => {
    const namespace = { ...fakeStorageNamespace(), sync: fullStorageArea("QUOTA_BYTES exceeded") };
    const adapter = webExtensionStorageAdapter({ storage: () => namespace, area: "sync" });

    await expect(adapter.get("theme")).resolves.toBeUndefined();
    await expect(adapter.remove("theme")).resolves.toBeUndefined();
  });
});

describe("invalid persisted data", () => {
  it("falls back when what another context stored no longer matches the schema", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ theme: "purple" });
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace }),
    });

    expect(await storage.get("theme")).toBe("light");
  });

  it("falls back when the stored value is not even the right kind", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ "app:user": "not an object" });
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace }),
    });

    expect(await storage.get("user")).toBeUndefined();
  });

  it("throws instead where the storage asks it to", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ theme: "purple" });
    const storage = createStorage({
      schema,
      adapter: webExtensionStorageAdapter({ storage: () => namespace }),
      onInvalid: "throw",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
  });
});
