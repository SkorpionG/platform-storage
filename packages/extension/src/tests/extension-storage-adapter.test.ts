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
import { extensionStorageAdapter } from "../extension-storage-adapter";
import {
  fakeStorageNamespace,
  rejectingStorageArea,
} from "../../tests/fakes/fake-extension-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  nullableName: { schema: z.string().nullable() },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extensionStorageAdapter", () => {
  it("answers only asynchronously, so a storage over it has no synchronous half", () => {
    const adapter = extensionStorageAdapter({ storage: () => fakeStorageNamespace() });

    expect(isSyncStorageAdapter(adapter)).toBe(false);
  });

  it("hands values over untouched, since the area stores JSON values natively", () => {
    const adapter = extensionStorageAdapter({ storage: () => fakeStorageNamespace() });

    expect(adapter.serializer).toBe(passthroughSerializer);
  });

  it("stores an object as an object, not as text", async () => {
    const storage = fakeStorageNamespace();
    const adapter = extensionStorageAdapter({ storage: () => storage });

    await adapter.set("app:user", { id: "u1", name: "Ada" });

    expect(storage.local.entries.get("app:user")).toEqual({ id: "u1", name: "Ada" });
    expect(await adapter.get("app:user")).toEqual({ id: "u1", name: "Ada" });
  });

  it("reports a missing key as undefined, since the area leaves it out of its answer", async () => {
    const storage = fakeStorageNamespace();
    const adapter = extensionStorageAdapter({ storage: () => storage });

    expect(await adapter.get("absent")).toBeUndefined();
  });

  it("keeps a stored null apart from a key that holds nothing", async () => {
    const storage = fakeStorageNamespace();
    const adapter = extensionStorageAdapter({ storage: () => storage });

    await adapter.set("nullableName", null);

    expect(await adapter.get("nullableName")).toBeNull();
    expect(storage.local.entries.get("nullableName")).toBeNull();
  });

  it("removes a key", async () => {
    const storage = fakeStorageNamespace();
    const adapter = extensionStorageAdapter({ storage: () => storage });

    await adapter.set("theme", "dark");
    await adapter.remove("theme");

    expect(storage.local.entries.has("theme")).toBe(false);
  });

  it("addresses the area it was given, and local when given none", async () => {
    const storage = fakeStorageNamespace();

    await extensionStorageAdapter({ storage: () => storage }).set("theme", "dark");
    await extensionStorageAdapter({ storage: () => storage, area: "sync" }).set("theme", "light");

    expect(storage.local.entries.get("theme")).toBe("dark");
    expect(storage.sync.entries.get("theme")).toBe("light");
    expect(storage.session?.entries.size).toBe(0);
  });

  it("resolves the namespace on every operation rather than once", async () => {
    const adapter = extensionStorageAdapter();

    await expect(adapter.get("theme")).rejects.toThrow(StorageUnavailableError);

    const storage = fakeStorageNamespace();
    vi.stubGlobal("chrome", { storage });
    await adapter.set("theme", "dark");

    expect(storage.local.entries.get("theme")).toBe("dark");
  });

  it("is named after its area, which errors then report", () => {
    expect(extensionStorageAdapter().name).toBe("storage.local");
    expect(extensionStorageAdapter({ area: "sync" }).name).toBe("storage.sync");
    expect(extensionStorageAdapter({ area: "session" }).name).toBe("storage.session");
    expect(extensionStorageAdapter({ name: "settings" }).name).toBe("settings");
  });
});

describe("an API that is not there", () => {
  it("is reported as unavailable, naming the adapter, the operation and the key", async () => {
    const adapter = extensionStorageAdapter();

    await expect(adapter.get("theme")).rejects.toThrow(StorageUnavailableError);
    await expect(adapter.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unavailable,
      adapter: "storage.local",
      operation: "set",
      physicalKey: "theme",
    });
  });

  it("reports a missing area the same way, as session is on Manifest V2", async () => {
    const adapter = extensionStorageAdapter({
      storage: () => fakeStorageNamespace({ session: false }),
      area: "session",
    });

    await expect(adapter.get("theme")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Unavailable,
      adapter: "storage.session",
    });
  });

  it("rejects rather than throwing, so an awaiting caller never needs try", async () => {
    const adapter = extensionStorageAdapter();

    // Reaching for the area fails before any promise exists. Holding the results before awaiting them is what proves that failure arrives as a rejection rather than escaping these calls.
    const read = adapter.get("theme");
    const removal = adapter.remove("theme");

    await expect(read).rejects.toThrow(StorageUnavailableError);
    await expect(removal).rejects.toThrow(StorageUnavailableError);
  });

  it("keeps its own error type through a storage, rather than being wrapped again", async () => {
    const storage = createStorage({ schema, adapter: extensionStorageAdapter() });

    await expect(storage.get("theme")).rejects.toThrow(StorageUnavailableError);
  });

  it("says so from its probe, without touching the area", () => {
    expect(extensionStorageAdapter().isAvailable?.()).toBe(false);
    expect(extensionStorageAdapter({ storage: () => fakeStorageNamespace() }).isAvailable?.()).toBe(
      true,
    );
    expect(
      extensionStorageAdapter({
        storage: () => fakeStorageNamespace({ session: false }),
        area: "session",
      }).isAvailable?.(),
    ).toBe(false);
    expect(
      extensionStorageAdapter({
        storage: () => {
          throw new Error("no api");
        },
      }).isAvailable?.(),
    ).toBe(false);
  });
});

describe("an area that rejects", () => {
  it("becomes an adapter error through a storage, keeping the browser's rejection as the cause", async () => {
    const namespace = { ...fakeStorageNamespace(), sync: rejectingStorageArea("quota exceeded") };
    const storage = createStorage({
      schema,
      adapter: extensionStorageAdapter({ storage: () => namespace, area: "sync" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toThrow(StorageAdapterError);
    await expect(storage.set("theme", "dark")).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
      adapter: "storage.sync",
      operation: "set",
      physicalKey: "theme",
      cause: expect.objectContaining({ message: "quota exceeded" }),
    });
  });
});

describe("invalid persisted data", () => {
  it("falls back when what another context stored no longer matches the schema", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ theme: "purple" });
    const storage = createStorage({
      schema,
      adapter: extensionStorageAdapter({ storage: () => namespace }),
    });

    expect(await storage.get("theme")).toBe("light");
  });

  it("falls back when the stored value is not even the right kind", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ "app:user": "not an object" });
    const storage = createStorage({
      schema,
      adapter: extensionStorageAdapter({ storage: () => namespace }),
    });

    expect(await storage.get("user")).toBeUndefined();
  });

  it("throws instead where the storage asks it to", async () => {
    const namespace = fakeStorageNamespace();
    await namespace.local.set({ theme: "purple" });
    const storage = createStorage({
      schema,
      adapter: extensionStorageAdapter({ storage: () => namespace }),
      onInvalid: "throw",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
  });
});
