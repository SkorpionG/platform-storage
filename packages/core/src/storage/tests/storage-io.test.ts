import { describe, expect, it } from "vitest";

import { memoryAdapter } from "../../adapter/memory-adapter";
import { STORAGE_ERROR_CODE } from "../../errors/codes";
import type { PlatformStorageError } from "../../errors/errors";
import { adapterWithoutPresenceCheck, failingAdapter } from "../../../tests/fakes/adapters";
import { isPromiseLike } from "../maybe-promise";
import { createAsyncIo, createSyncIo } from "../storage-io";

const passThrough = (error: PlatformStorageError): PlatformStorageError => error;

describe("createAsyncIo", () => {
  it("round-trips a value through the adapter's asynchronous methods", async () => {
    const io = createAsyncIo(memoryAdapter(), passThrough);

    await io.set("theme", '"dark"');

    expect(await io.get("theme")).toBe('"dark"');
    expect(await io.has("theme")).toBe(true);

    await io.remove("theme");

    expect(await io.get("theme")).toBeUndefined();
    expect(await io.has("theme")).toBe(false);
  });

  it("derives presence from a read when the adapter has no cheaper check", async () => {
    const io = createAsyncIo(adapterWithoutPresenceCheck("no-has"), passThrough);

    expect(await io.has("theme")).toBe(false);

    await io.set("theme", '"dark"');

    expect(await io.has("theme")).toBe(true);
  });

  it("wraps whatever the backend rejects with", async () => {
    const io = createAsyncIo(failingAdapter("no"), passThrough);

    await expect(io.get("theme")).rejects.toThrow(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.Adapter, adapter: "failing" }),
    );
  });

  it("reports a failure to the observer once per call", async () => {
    const seen: Array<PlatformStorageError> = [];
    const io = createAsyncIo(failingAdapter("no"), (error) => {
      seen.push(error);
      return error;
    });

    await expect(io.set("theme", '"dark"')).rejects.toThrow();

    expect(seen).toHaveLength(1);
  });
});

describe("createSyncIo", () => {
  it("round-trips a value without ever producing a promise", () => {
    const io = createSyncIo(memoryAdapter(), passThrough);

    expect(isPromiseLike(io.set("theme", '"dark"'))).toBe(false);
    expect(io.get("theme")).toBe('"dark"');
    expect(io.has("theme")).toBe(true);

    io.remove("theme");

    expect(io.get("theme")).toBeUndefined();
    expect(io.has("theme")).toBe(false);
  });

  it("derives presence from a read when the adapter has no synchronous check", () => {
    const io = createSyncIo(adapterWithoutPresenceCheck("no-has-sync"), passThrough);

    expect(io.has("theme")).toBe(false);

    io.set("theme", '"dark"');

    expect(io.has("theme")).toBe(true);
  });

  it("reads back what the asynchronous half of the same adapter wrote", async () => {
    const adapter = memoryAdapter();
    const sync = createSyncIo(adapter, passThrough);

    await createAsyncIo(adapter, passThrough).set("theme", '"dark"');

    expect(sync.get("theme")).toBe('"dark"');
  });

  it("wraps a synchronous throw from the backend", () => {
    const adapter = memoryAdapter();
    const broken = {
      ...adapter,
      getSync: () => {
        throw new Error("refused");
      },
    };

    expect(() => createSyncIo(broken, passThrough).get("theme")).toThrow(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.Adapter, adapter: "memory" }),
    );
  });
});
