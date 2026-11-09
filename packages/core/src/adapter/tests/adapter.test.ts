import { describe, expect, it, vi } from "vitest";

import { defineSyncAdapter, isSyncStorageAdapter, jsonSerializer } from "../../index";
import type { StorageAdapter, SyncAdapterDefinition } from "../../index";
import { asyncOnlyAdapter } from "../../../tests/fakes/adapters";

function memoryDefinition(
  overrides: Partial<SyncAdapterDefinition<string>> = {},
): SyncAdapterDefinition<string> {
  const entries = new Map<string, string>();

  return {
    name: "test",
    serializer: jsonSerializer,
    getSync: (key) => entries.get(key),
    setSync: (key, value) => {
      entries.set(key, value);
    },
    removeSync: (key) => {
      entries.delete(key);
    },
    ...overrides,
  };
}

describe("defineSyncAdapter", () => {
  it("derives the asynchronous half, so each operation is written once", async () => {
    const adapter = defineSyncAdapter(memoryDefinition());

    await adapter.set("theme", '"dark"');

    expect(adapter.getSync("theme")).toBe('"dark"');
    expect(await adapter.get("theme")).toBe('"dark"');
  });

  it("reports a missing key as undefined rather than null", async () => {
    const adapter = defineSyncAdapter(memoryDefinition());

    expect(adapter.getSync("absent")).toBeUndefined();
    expect(await adapter.get("absent")).toBeUndefined();
  });

  it("removes through either half", async () => {
    const adapter = defineSyncAdapter(memoryDefinition());

    adapter.setSync("theme", '"dark"');
    await adapter.remove("theme");
    expect(adapter.getSync("theme")).toBeUndefined();

    adapter.setSync("theme", '"dark"');
    adapter.removeSync("theme");
    expect(adapter.getSync("theme")).toBeUndefined();
  });

  it("turns a synchronous throw into a rejection, so an awaiting caller never needs try", async () => {
    const adapter = defineSyncAdapter(
      memoryDefinition({
        getSync: () => {
          throw new Error("storage is gone");
        },
      }),
    );

    await expect(adapter.get("theme")).rejects.toThrow("storage is gone");
    expect(() => adapter.getSync("theme")).toThrow("storage is gone");
  });

  it("turns a throwing write into a rejection too", async () => {
    const adapter = defineSyncAdapter(
      memoryDefinition({
        setSync: () => {
          throw new Error("quota exceeded");
        },
      }),
    );

    await expect(adapter.set("theme", '"dark"')).rejects.toThrow("quota exceeded");
  });

  it("omits the optional members a definition does not provide", () => {
    const adapter = defineSyncAdapter(memoryDefinition());

    expect(adapter.hasSync).toBeUndefined();
    expect(adapter.has).toBeUndefined();
    expect(adapter.isAvailable).toBeUndefined();
  });

  it("provides both halves of an existence check when the definition has one", async () => {
    const adapter = defineSyncAdapter(memoryDefinition({ hasSync: (key) => key === "theme" }));

    expect(adapter.hasSync?.("theme")).toBe(true);
    expect(await adapter.has?.("theme")).toBe(true);
    expect(adapter.hasSync?.("other")).toBe(false);
  });

  it("carries the availability probe through", () => {
    const adapter = defineSyncAdapter(memoryDefinition({ isAvailable: () => false }));

    expect(adapter.isAvailable?.()).toBe(false);
  });

  it("keeps the name and serializer the definition declared", () => {
    const adapter = defineSyncAdapter(memoryDefinition());

    expect(adapter.name).toBe("test");
    expect(adapter.serializer).toBe(jsonSerializer);
  });
});

describe("isSyncStorageAdapter", () => {
  it("recognizes an adapter that can answer immediately", () => {
    expect(isSyncStorageAdapter(defineSyncAdapter(memoryDefinition()))).toBe(true);
  });

  it("rejects an adapter that only answers asynchronously", () => {
    expect(isSyncStorageAdapter(asyncOnlyAdapter)).toBe(false);
  });

  it("rejects an adapter that implements only part of the synchronous half", () => {
    const partial = { ...asyncOnlyAdapter, getSync: () => undefined } as StorageAdapter<string>;

    expect(isSyncStorageAdapter(partial)).toBe(false);
  });
});

describe("defineSyncAdapter listing", () => {
  const base = {
    name: "listing",
    serializer: jsonSerializer,
    getSync: () => undefined,
    setSync: () => undefined,
    removeSync: () => undefined,
  };

  it("derives the asynchronous half from keysSync", async () => {
    const adapter = defineSyncAdapter({ ...base, keysSync: () => ["a"] });

    expect(adapter.keysSync?.()).toEqual(["a"]);
    await expect(adapter.keys?.()).resolves.toEqual(["a"]);
  });

  it("offers no listing without keysSync", () => {
    const adapter = defineSyncAdapter(base);

    expect(adapter.keys).toBeUndefined();
    expect(adapter.keysSync).toBeUndefined();
  });
});

describe("defineSyncAdapter following changes", () => {
  it("carries subscribe through", () => {
    const stop = vi.fn();
    const adapter = defineSyncAdapter({
      ...memoryDefinition(),
      subscribe: () => ({ stop, reportsOwnWrites: false }),
    });

    adapter.subscribe?.(() => undefined).stop();

    expect(stop).toHaveBeenCalledOnce();
  });

  it("offers none without it", () => {
    expect(defineSyncAdapter(memoryDefinition()).subscribe).toBeUndefined();
  });
});
