import { describe, expect, it, vi } from "vitest";

import { memoryAdapter } from "../../adapter/memory-adapter";
import { STORAGE_ERROR_CODE, STORAGE_OPERATION } from "../../errors/codes";
import { StorageUnavailableError } from "../../errors/errors";
import type { PlatformStorageError } from "../../errors/errors";
import { callAdapter } from "../adapter-calls";

const adapter = memoryAdapter({ name: "test-double" });

/** The engine hands every failure to `onError` and then throws it; this stands in for that. */
function collector(): {
  readonly report: (error: PlatformStorageError) => PlatformStorageError;
  readonly seen: Array<PlatformStorageError>;
} {
  const seen: Array<PlatformStorageError> = [];

  return {
    seen,
    report: (error) => {
      seen.push(error);
      return error;
    },
  };
}

describe("callAdapter", () => {
  it("returns a synchronous value without touching it", () => {
    const { report } = collector();

    expect(callAdapter(adapter, STORAGE_OPERATION.Get, "theme", report, () => "dark")).toBe("dark");
  });

  it("resolves an asynchronous value without touching it", async () => {
    const { report } = collector();

    await expect(
      callAdapter(adapter, STORAGE_OPERATION.Get, "theme", report, () => Promise.resolve("dark")),
    ).resolves.toBe("dark");
  });

  it("reports nothing when the call succeeds", () => {
    const { report, seen } = collector();

    callAdapter(adapter, STORAGE_OPERATION.Get, "theme", report, () => "dark");

    expect(seen).toEqual([]);
  });

  it("wraps a synchronous throw as a StorageAdapterError naming where it happened", () => {
    const { report } = collector();
    const cause = new Error("quota");

    expect(() =>
      callAdapter(adapter, STORAGE_OPERATION.Set, "app:user", report, () => {
        throw cause;
      }),
    ).toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Adapter,
        adapter: "test-double",
        operation: STORAGE_OPERATION.Set,
        physicalKey: "app:user",
        cause,
      }),
    );
  });

  it("wraps a rejection the same way", async () => {
    const { report } = collector();

    await expect(
      callAdapter(adapter, STORAGE_OPERATION.Remove, "theme", report, () =>
        Promise.reject(new Error("gone")),
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Adapter,
        operation: STORAGE_OPERATION.Remove,
      }),
    );
  });

  it("wraps something thrown that was never an Error, as a backend is free to do", () => {
    const { report } = collector();

    expect(() =>
      callAdapter(adapter, STORAGE_OPERATION.Get, "theme", report, () => {
        throw "a plain string";
      }),
    ).toThrow(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.Adapter, cause: "a plain string" }),
    );
  });

  it("lets one of this library's own errors through untouched, so an unavailable backend keeps its type", () => {
    const { report } = collector();
    const original = new StorageUnavailableError({
      adapter: "test-double",
      operation: STORAGE_OPERATION.Get,
    });

    expect(() =>
      callAdapter(adapter, STORAGE_OPERATION.Get, "theme", report, () => {
        throw original;
      }),
    ).toThrow(expect.objectContaining({ code: STORAGE_ERROR_CODE.Unavailable }));
  });

  it("reports every failure to the observer, whichever kind it is", () => {
    const { report, seen } = collector();

    expect(() =>
      callAdapter(adapter, STORAGE_OPERATION.Get, "theme", report, () => {
        throw new Error("boom");
      }),
    ).toThrow();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.code).toBe(STORAGE_ERROR_CODE.Adapter);
  });

  it("omits the key from the message when there is none to name", () => {
    const { report } = collector();
    const run = vi.fn(() => {
      throw new Error("boom");
    });

    expect(() => callAdapter(adapter, STORAGE_OPERATION.Clear, undefined, report, run)).toThrow(
      "The test-double adapter failed to clear.",
    );
    expect(run).toHaveBeenCalledOnce();
  });
});
