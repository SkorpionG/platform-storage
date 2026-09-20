import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  isSyncStorageAdapter,
  jsonSerializer,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageAdapterError,
  StorageUnavailableError,
  StorageValidationError,
  withFallback,
} from "../index";
import { isQuotaExceeded, isWebStorageAvailable, webStorageAdapter } from "../web-storage-adapter";
import { storageRefusingWrites, throwingStorage } from "../../tests/fakes/throwing-storage";

/** Stands in for reaching `window.localStorage` where the browser refuses to hand it over. */
function refusedStorage(): Storage {
  throw new DOMException("The operation is insecure.", "SecurityError");
}

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
});

beforeEach(() => {
  localStorage.clear();
});

describe("webStorageAdapter", () => {
  it("can answer immediately, so a storage over it gets the synchronous half", () => {
    expect(isSyncStorageAdapter(webStorageAdapter(() => localStorage))).toBe(true);
  });

  it("transports JSON text, since web storage holds only strings", () => {
    expect(webStorageAdapter(() => localStorage).serializer).toBe(jsonSerializer);
  });

  it("writes to and reads from the storage it is given", async () => {
    const adapter = webStorageAdapter(() => localStorage);

    adapter.setSync("theme", '"dark"');

    expect(localStorage.getItem("theme")).toBe('"dark"');
    expect(adapter.getSync("theme")).toBe('"dark"');
    expect(await adapter.get("theme")).toBe('"dark"');
  });

  it("reports a missing key as undefined, where the storage itself says null", async () => {
    const adapter = webStorageAdapter(() => localStorage);

    expect(adapter.getSync("absent")).toBeUndefined();
    expect(await adapter.get("absent")).toBeUndefined();
  });

  it("removes a key", () => {
    const adapter = webStorageAdapter(() => localStorage);

    adapter.setSync("theme", '"dark"');
    adapter.removeSync("theme");

    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("answers presence without deserializing", async () => {
    const adapter = webStorageAdapter(() => localStorage);

    localStorage.setItem("broken", "{not json");

    expect(adapter.hasSync?.("broken")).toBe(true);
    expect(await adapter.has?.("broken")).toBe(true);
    expect(adapter.hasSync?.("absent")).toBe(false);
  });

  it("reaches for the storage on every operation rather than once", () => {
    const getStorage = vi.fn(() => localStorage);
    const adapter = webStorageAdapter(getStorage);

    expect(getStorage).not.toHaveBeenCalled();

    adapter.setSync("theme", '"dark"');
    adapter.getSync("theme");
    adapter.hasSync?.("theme");
    adapter.removeSync("theme");

    expect(getStorage).toHaveBeenCalledTimes(4);
  });

  it("takes a name, which errors then report", () => {
    expect(webStorageAdapter(() => localStorage).name).toBe("web-storage");
    expect(webStorageAdapter(() => localStorage, { name: "prefs" }).name).toBe("prefs");
  });
});

describe("a storage that cannot be reached", () => {
  it("is reported as unavailable, naming the operation and the key", () => {
    const adapter = webStorageAdapter(refusedStorage, { name: "prefs" });

    expect(() => adapter.setSync("theme", '"dark"')).toThrow(StorageUnavailableError);
    expect(() => adapter.setSync("theme", '"dark"')).toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Unavailable,
        adapter: "prefs",
        operation: "set",
        physicalKey: "theme",
        cause: expect.any(DOMException),
      }),
    );
  });

  it("is unavailable for every operation, not only reads", async () => {
    const adapter = webStorageAdapter(refusedStorage);

    expect(() => adapter.removeSync("theme")).toThrow(StorageUnavailableError);
    expect(() => adapter.hasSync?.("theme")).toThrow(StorageUnavailableError);
    await expect(adapter.get("theme")).rejects.toThrow(StorageUnavailableError);
    await expect(adapter.set("theme", '"dark"')).rejects.toThrow(StorageUnavailableError);
  });

  it("treats a getter that answers with nothing the same way", () => {
    expect(() => webStorageAdapter(() => undefined).getSync("theme")).toThrow(
      StorageUnavailableError,
    );
    expect(() => webStorageAdapter(() => null).getSync("theme")).toThrow(StorageUnavailableError);
  });

  it("recovers once the storage can be reached, since it never kept a failed attempt", () => {
    let reachable = false;
    const adapter = webStorageAdapter(() => (reachable ? localStorage : refusedStorage()));

    expect(() => adapter.getSync("theme")).toThrow(StorageUnavailableError);

    reachable = true;
    adapter.setSync("theme", '"dark"');

    expect(adapter.getSync("theme")).toBe('"dark"');
  });

  it("keeps its own error type through a storage, rather than being wrapped again", async () => {
    const storage = createStorage({ schema, adapter: webStorageAdapter(refusedStorage) });

    await expect(storage.get("theme")).rejects.toThrow(StorageUnavailableError);
    expect(() => storage.getSync("theme")).toThrow(StorageUnavailableError);
  });

  it("is what withFallback moves past, so one storage serves both the browser and the server", async () => {
    const fallback = memoryAdapter();
    const storage = createStorage({
      schema,
      adapter: withFallback(webStorageAdapter(refusedStorage), fallback),
    });

    await storage.set("theme", "dark");

    expect(await storage.get("theme")).toBe("dark");
    expect(storage.getSync("theme")).toBe("dark");
    expect(fallback.entries.get("theme")).toBe('"dark"');
  });
});

describe("a storage that refuses a write", () => {
  it("throws in the browser's own vocabulary at the adapter, for the engine to wrap", () => {
    const adapter = webStorageAdapter(() => storageRefusingWrites(new Error("no")));

    expect(() => adapter.setSync("theme", '"dark"')).toThrow("no");
  });

  it("becomes an adapter error through a storage, keeping the browser's exception as the cause", async () => {
    const cause = new Error("no");
    const storage = createStorage({
      schema,
      adapter: webStorageAdapter(() => storageRefusingWrites(cause)),
    });

    await storage.set("theme", "dark").catch((error: StorageAdapterError) => {
      expect(error).toBeInstanceOf(StorageAdapterError);
      expect(error.code).toBe(STORAGE_ERROR_CODE.Adapter);
      expect(error.operation).toBe("set");
      expect(error.physicalKey).toBe("theme");
      expect(error.cause).toBe(cause);
    });

    expect.assertions(5);
  });
});

/*
  The one backend failure this adapter names itself. Everything else is left in the browser's vocabulary for the engine to wrap, but only the adapter knows how its own platform reports a full origin, and it is the one case a caller can act on by evicting something and writing again.
*/
describe("a full origin", () => {
  const quotaFailures = [
    ["the standard exception", new DOMException("full", "QuotaExceededError")],
    ["the name older Firefox used", new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED")],
    ["an older browser setting only the DOM code", { name: "Error", code: 22 }],
    ["an older Firefox setting only its code", { name: "Error", code: 1014 }],
  ] as const;

  it.each(quotaFailures)("is recognized from %s", (_label, failure) => {
    expect(isQuotaExceeded(failure)).toBe(true);
  });

  it("is not claimed for a refusal that says nothing about room", () => {
    expect(isQuotaExceeded(new Error("no"))).toBe(false);
    expect(isQuotaExceeded(new DOMException("denied", "SecurityError"))).toBe(false);
    expect(isQuotaExceeded({ code: 23 })).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
    expect(isQuotaExceeded("QuotaExceededError")).toBe(false);
  });

  it("surfaces with its own code, so a caller can evict and retry rather than only report", async () => {
    const cause = new DOMException("full", "QuotaExceededError");
    const storage = createStorage({
      schema,
      adapter: webStorageAdapter(() => storageRefusingWrites(cause), { name: "localStorage" }),
    });

    await expect(storage.set("theme", "dark")).rejects.toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Quota,
        adapter: "localStorage",
        operation: "set",
        physicalKey: "theme",
        cause,
      }),
    );
  });

  it("is still an adapter failure, so anything catching those still catches it", async () => {
    const storage = createStorage({
      schema,
      adapter: webStorageAdapter(() =>
        storageRefusingWrites(new DOMException("full", "QuotaExceededError")),
      ),
    });

    await expect(storage.set("theme", "dark")).rejects.toBeInstanceOf(StorageAdapterError);
  });

  it("leaves reads and removes alone, since only a write can run out of room", () => {
    const adapter = webStorageAdapter(() =>
      storageRefusingWrites(new DOMException("full", "QuotaExceededError")),
    );

    expect(adapter.getSync("theme")).toBeUndefined();
    expect(() => {
      adapter.removeSync("theme");
    }).not.toThrow();
  });
});

describe("invalid persisted data", () => {
  it("falls back to the default when what is stored no longer matches the schema", async () => {
    localStorage.setItem("theme", '"purple"');
    const storage = createStorage({ schema, adapter: webStorageAdapter(() => localStorage) });

    expect(await storage.get("theme")).toBe("light");
    expect(storage.getSync("theme")).toBe("light");
  });

  it("falls back when what is stored is not JSON at all, as hand-edited storage often is not", async () => {
    localStorage.setItem("theme", "dark");
    const storage = createStorage({ schema, adapter: webStorageAdapter(() => localStorage) });

    expect(await storage.get("theme")).toBe("light");
  });

  it("throws instead where the storage asks it to", async () => {
    localStorage.setItem("theme", '"purple"');
    const storage = createStorage({
      schema,
      adapter: webStorageAdapter(() => localStorage),
      onInvalid: "throw",
    });

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
  });
});

describe("isWebStorageAvailable", () => {
  it("reports a usable storage as available", () => {
    expect(isWebStorageAvailable(() => localStorage)).toBe(true);
  });

  it("leaves no probe key behind", () => {
    isWebStorageAvailable(() => localStorage);

    expect(localStorage.length).toBe(0);
  });

  it("reports a storage whose writes throw as unavailable", () => {
    expect(isWebStorageAvailable(throwingStorage)).toBe(false);
  });

  it("reports unavailable when reaching for the storage itself throws", () => {
    expect(isWebStorageAvailable(refusedStorage)).toBe(false);
  });

  it("reports unavailable when the getter answers with nothing", () => {
    expect(isWebStorageAvailable(() => undefined)).toBe(false);
    expect(isWebStorageAvailable(() => null)).toBe(false);
  });

  it("is what the adapter's own probe answers with", () => {
    expect(webStorageAdapter(() => localStorage).isAvailable?.()).toBe(true);
    expect(webStorageAdapter(() => throwingStorage()).isAvailable?.()).toBe(false);
    expect(webStorageAdapter(refusedStorage).isAvailable?.()).toBe(false);
  });
});
