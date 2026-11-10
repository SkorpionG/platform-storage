import { describe, expect, it } from "vitest";

import { defineSyncAdapter } from "../../adapter/adapter";
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

function recordingBatches() {
  const memory = memoryAdapter();
  const calls: Array<string> = [];
  const adapter = {
    ...memory,
    getMany: (keys: ReadonlyArray<string>) => {
      calls.push(`getMany ${keys.join(",")}`);

      return Promise.resolve(
        new Map(
          keys.flatMap((key) => {
            const wire = memory.getSync(key);

            return wire === undefined ? [] : [[key, wire] as const];
          }),
        ),
      );
    },
    setMany: (entries: ReadonlyMap<string, string>) => {
      calls.push(`setMany ${[...entries.keys()].join(",")}`);

      for (const [key, value] of entries) memory.setSync(key, value);

      return Promise.resolve();
    },
    removeMany: (keys: ReadonlyArray<string>) => {
      calls.push(`removeMany ${keys.join(",")}`);

      for (const key of keys) memory.removeSync(key);

      return Promise.resolve();
    },
  };

  return { adapter, calls, memory };
}

describe("batches through StorageIo", () => {
  it("uses the backend's batch methods in one call each", async () => {
    const { adapter, calls } = recordingBatches();
    const io = createAsyncIo(adapter, passThrough);

    await io.setMany(
      new Map([
        ["a", "1"],
        ["b", "2"],
      ]),
    );

    expect(await io.getMany(["a", "b", "c"])).toEqual(
      new Map([
        ["a", "1"],
        ["b", "2"],
      ]),
    );

    await io.removeMany(["a", "b"]);

    expect(calls).toEqual(["setMany a,b", "getMany a,b,c", "removeMany a,b"]);
  });

  it("asks the backend nothing for an empty batch", async () => {
    const { adapter, calls } = recordingBatches();
    const io = createAsyncIo(adapter, passThrough);

    expect(await io.getMany([])).toEqual(new Map());
    await io.setMany(new Map());
    await io.removeMany([]);

    expect(calls).toEqual([]);
  });

  it("reaches each name in turn where the backend has no batch method", async () => {
    const io = createAsyncIo(memoryAdapter({ initial: { a: "1" } }), passThrough);

    await io.setMany(new Map([["b", "2"]]));

    expect(await io.getMany(["a", "b", "c"])).toEqual(
      new Map([
        ["a", "1"],
        ["b", "2"],
      ]),
    );

    await io.removeMany(["a", "b"]);

    expect(await io.getMany(["a", "b"])).toEqual(new Map());
  });

  it("answers immediately on the synchronous path, batch or not", () => {
    const sync = createSyncIo(
      defineSyncAdapter({
        name: "batching",
        serializer: memoryAdapter().serializer,
        getSync: () => undefined,
        setSync: () => undefined,
        removeSync: () => undefined,
        getManySync: () => new Map([["a", "1"]]),
        setManySync: () => undefined,
        removeManySync: () => undefined,
      }),
      passThrough,
    );
    const looping = createSyncIo(memoryAdapter({ initial: { a: "1" } }), passThrough);

    expect(sync.getMany(["a"])).toEqual(new Map([["a", "1"]]));
    expect(sync.setMany(new Map([["a", "2"]]))).toBeUndefined();
    expect(sync.removeMany(["a"])).toBeUndefined();
    expect(looping.getMany(["a", "b"])).toEqual(new Map([["a", "1"]]));
    expect(looping.setMany(new Map([["b", "2"]]))).toBeUndefined();
    expect(looping.removeMany(["a", "b"])).toBeUndefined();
  });

  it("names the batch operation, and no single name, when a batch call fails", async () => {
    const errors: Array<PlatformStorageError> = [];
    const report = (error: PlatformStorageError): PlatformStorageError => {
      errors.push(error);

      return error;
    };
    const failing = {
      ...memoryAdapter(),
      getMany: () => Promise.reject(new Error("refused")),
      setMany: () => Promise.reject(new Error("refused")),
      removeMany: () => Promise.reject(new Error("refused")),
    };
    const io = createAsyncIo(failing, report);

    await expect(io.getMany(["a"])).rejects.toMatchObject({
      code: STORAGE_ERROR_CODE.Adapter,
      operation: "getMany",
      physicalKey: undefined,
    });
    await expect(io.setMany(new Map([["a", "1"]]))).rejects.toMatchObject({ operation: "setMany" });
    await expect(io.removeMany(["a"])).rejects.toMatchObject({ operation: "removeMany" });

    expect(errors).toHaveLength(3);
  });

  it("names the key that failed when it reaches each name in turn", async () => {
    const io = createAsyncIo(failingAdapter("refused"), passThrough);

    await expect(io.getMany(["a"])).rejects.toMatchObject({ operation: "get", physicalKey: "a" });
  });
});
