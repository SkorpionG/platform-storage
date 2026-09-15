import { PlatformStorageError, STORAGE_ERROR_CODE } from "@platform-storage/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStorageErrors,
  getServerStorageErrors,
  getStorageErrors,
  recordStorageError,
  subscribeToStorageErrors,
} from "../error-log";

function failure(message: string): PlatformStorageError {
  return new PlatformStorageError(STORAGE_ERROR_CODE.Validation, message);
}

/* The log is one collector for the page, as an `onError` observer has to be, so each test starts from empty. */
beforeEach(() => {
  clearStorageErrors();
});

describe("recordStorageError", () => {
  it("publishes nothing until the render that produced the failure is over", () => {
    recordStorageError(failure("first"));

    expect(getStorageErrors()).toHaveLength(0);
  });

  it("publishes once the microtask runs", async () => {
    recordStorageError(failure("first"));
    await Promise.resolve();

    expect(getStorageErrors()).toHaveLength(1);
  });

  it("tells its listeners once for a batch rather than once per failure", async () => {
    const listener = vi.fn();
    subscribeToStorageErrors(listener);

    recordStorageError(failure("first"));
    recordStorageError(failure("second"));
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStorageErrors()).toHaveLength(2);
  });

  it("collapses an identical repeat into a count", async () => {
    recordStorageError(failure("same"));
    recordStorageError(failure("same"));
    await Promise.resolve();

    const [entry] = getStorageErrors();

    expect(getStorageErrors()).toHaveLength(1);
    expect(entry?.count).toBe(2);
  });

  it("keeps failures that differ apart", async () => {
    recordStorageError(failure("one"));
    recordStorageError(failure("two"));
    await Promise.resolve();

    expect(getStorageErrors().map((entry) => entry.error.message)).toStrictEqual(["two", "one"]);
  });

  it("carries the error itself, not a copy of its fields", async () => {
    const error = failure("the original");
    recordStorageError(error);
    await Promise.resolve();

    expect(getStorageErrors()[0]?.error).toBe(error);
  });

  it("gives each entry an id of its own", async () => {
    recordStorageError(failure("one"));
    recordStorageError(failure("two"));
    await Promise.resolve();

    const [newest, oldest] = getStorageErrors();

    expect(newest?.id).not.toBe(oldest?.id);
  });

  it("keeps the newest and drops the rest rather than growing without end", async () => {
    for (let index = 0; index < 60; index += 1) recordStorageError(failure(`failure ${index}`));
    await Promise.resolve();

    expect(getStorageErrors()).toHaveLength(50);
    expect(getStorageErrors()[0]?.error.message).toBe("failure 59");
  });

  it("answers with the same empty array on a server, so a snapshot holds still", () => {
    expect(getServerStorageErrors()).toBe(getServerStorageErrors());
    expect(getServerStorageErrors()).toHaveLength(0);
  });
});

describe("clearStorageErrors", () => {
  it("empties the log and says so", async () => {
    const listener = vi.fn();
    recordStorageError(failure("first"));
    await Promise.resolve();

    subscribeToStorageErrors(listener);
    clearStorageErrors();

    expect(getStorageErrors()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
