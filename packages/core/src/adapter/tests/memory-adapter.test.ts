import { describe, expect, it } from "vitest";

import { isSyncStorageAdapter, jsonSerializer, memoryAdapter } from "../../index";

describe("memoryAdapter", () => {
  it("can answer immediately, so a storage over it gets the synchronous half", () => {
    expect(isSyncStorageAdapter(memoryAdapter())).toBe(true);
  });

  it("transports strings through the JSON serializer, as the real string backends do", () => {
    expect(memoryAdapter().serializer).toBe(jsonSerializer);
  });

  it("starts from the values it was given, as though a previous run had written them", () => {
    const adapter = memoryAdapter({ initial: { theme: '"dark"' } });

    expect(adapter.getSync("theme")).toBe('"dark"');
  });

  it("exposes what it holds, so a test can look without going back through a storage", () => {
    const adapter = memoryAdapter();

    adapter.setSync("theme", '"dark"');

    expect(adapter.entries.get("theme")).toBe('"dark"');
    expect([...adapter.entries.keys()]).toEqual(["theme"]);
  });

  it("keeps two instances apart, so one suite cannot leak into another", () => {
    const first = memoryAdapter();
    const second = memoryAdapter();

    first.setSync("theme", '"dark"');

    expect(second.getSync("theme")).toBeUndefined();
  });

  it("does not share the object it was seeded from", () => {
    const initial = { theme: '"dark"' };
    const adapter = memoryAdapter({ initial });

    adapter.setSync("theme", '"light"');

    expect(initial.theme).toBe('"dark"');
  });

  it("reports a missing key as undefined rather than null", () => {
    expect(memoryAdapter().getSync("absent")).toBeUndefined();
  });

  it("answers presence without deserializing", () => {
    const adapter = memoryAdapter({ initial: { broken: "{not json" } });

    expect(adapter.hasSync?.("broken")).toBe(true);
    expect(adapter.hasSync?.("absent")).toBe(false);
  });

  it("takes a name, which errors then report", () => {
    expect(memoryAdapter({ name: "test-double" }).name).toBe("test-double");
    expect(memoryAdapter().name).toBe("memory");
  });
});
