import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  isSyncStorageAdapter,
  memoryAdapter,
  withFallback,
} from "../../index";
import { themeSchema } from "../../../tests/fixtures/schemas";
import {
  adapterWithoutPresenceCheck,
  asyncOnlyAdapter,
  unavailableAdapter,
} from "../../../tests/fakes/adapters";

describe("withFallback", () => {
  it("uses the first backend when its probe says it is there", () => {
    const primary = memoryAdapter({ name: "primary" });
    const adapter = withFallback(
      { ...primary, isAvailable: () => true },
      memoryAdapter({ name: "fallback" }),
    );

    adapter.setSync("theme", '"dark"');

    expect(primary.entries.get("theme")).toBe('"dark"');
  });

  it("uses the second when the first says it is not there", () => {
    const fallback = memoryAdapter({ name: "fallback" });
    const adapter = withFallback(unavailableAdapter(), fallback);

    adapter.setSync("theme", '"dark"');

    expect(fallback.entries.get("theme")).toBe('"dark"');
  });

  it("treats a backend with no probe as available, since most cannot answer the question", () => {
    // The memory adapter declares no `isAvailable`, which is the common case.
    const primary = memoryAdapter({ name: "primary" });
    const adapter = withFallback(primary, memoryAdapter({ name: "fallback" }));

    adapter.setSync("theme", '"dark"');

    expect(primary.entries.get("theme")).toBe('"dark"');
  });

  it("decides on first use rather than at construction", () => {
    const isAvailable = vi.fn(() => true);
    const primary = { ...memoryAdapter({ name: "primary" }), isAvailable };

    const adapter = withFallback(primary, memoryAdapter());
    expect(isAvailable).not.toHaveBeenCalled();

    adapter.getSync("theme");
    expect(isAvailable).toHaveBeenCalled();
  });

  it("keeps its choice, so a value cannot be written to one and read from the other", () => {
    let available = true;
    const primary = memoryAdapter({ name: "primary" });
    const fallback = memoryAdapter({ name: "fallback" });
    const adapter = withFallback({ ...primary, isAvailable: () => available }, fallback);

    adapter.setSync("theme", '"dark"');
    available = false;

    expect(adapter.getSync("theme")).toBe('"dark"');
    expect(fallback.entries.size).toBe(0);
  });

  it("stays synchronous when both halves are", () => {
    expect(isSyncStorageAdapter(withFallback(memoryAdapter(), memoryAdapter()))).toBe(true);
  });

  it("is asynchronous only when either half is", () => {
    expect(isSyncStorageAdapter(withFallback(asyncOnlyAdapter, memoryAdapter()))).toBe(false);
    expect(isSyncStorageAdapter(withFallback(memoryAdapter(), asyncOnlyAdapter))).toBe(false);
  });

  it("names both halves, so an error says which pair was in play", () => {
    const adapter = withFallback(
      memoryAdapter({ name: "local" }),
      memoryAdapter({ name: "memory" }),
    );

    expect(adapter.name).toBe("local (falling back to memory)");
  });

  it("answers presence through whichever backend it chose", async () => {
    const adapter = withFallback(unavailableAdapter(), memoryAdapter({ name: "fallback" }));

    adapter.setSync("theme", '"dark"');

    expect(adapter.hasSync?.("theme")).toBe(true);
    expect(await adapter.has?.("theme")).toBe(true);
    expect(adapter.hasSync?.("absent")).toBe(false);
  });

  it("removes through whichever backend it chose", async () => {
    const fallback = memoryAdapter({ name: "fallback" });
    const adapter = withFallback(unavailableAdapter(), fallback);

    adapter.setSync("theme", '"dark"');
    await adapter.remove("theme");

    expect(fallback.entries.size).toBe(0);
  });

  it("builds one storage that works whether or not the real backend is there", async () => {
    const schema = defineStorageSchema({ theme: { schema: themeSchema, default: "light" } });
    const storage = createStorage({
      schema,
      adapter: withFallback(unavailableAdapter(), memoryAdapter()),
    });

    await storage.set("theme", "dark");

    expect(await storage.get("theme")).toBe("dark");
    expect(storage.getSync("theme")).toBe("dark");
  });
});

describe("backends that answer only part of the contract", () => {
  it("derives presence from a read when the chosen backend cannot answer it", async () => {
    const adapter = withFallback(
      adapterWithoutPresenceCheck("primary"),
      adapterWithoutPresenceCheck("fallback"),
    );

    expect(await adapter.has?.("theme")).toBe(false);
    expect(adapter.hasSync?.("theme")).toBe(false);

    adapter.setSync("theme", '"dark"');

    expect(await adapter.has?.("theme")).toBe(true);
    expect(adapter.hasSync?.("theme")).toBe(true);
  });

  it("removes synchronously through whichever backend it chose", () => {
    const fallback = memoryAdapter({ name: "fallback" });
    const adapter = withFallback(unavailableAdapter(), fallback);

    adapter.setSync("theme", '"dark"');
    adapter.removeSync("theme");

    expect(fallback.entries.size).toBe(0);
  });
});

describe("the combined adapter's own probe", () => {
  it("reports available when the backend it chose is", () => {
    expect(withFallback(memoryAdapter(), memoryAdapter()).isAvailable?.()).toBe(true);
  });

  it("reports what the fallback says once it has fallen back to it", () => {
    const fallback = { ...memoryAdapter({ name: "fallback" }), isAvailable: () => false };

    expect(withFallback(unavailableAdapter(), fallback).isAvailable?.()).toBe(false);
  });
});
