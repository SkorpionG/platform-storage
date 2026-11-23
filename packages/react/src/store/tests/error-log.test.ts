import { PlatformStorageError, STORAGE_ERROR_CODE } from "@platform-storage/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStorageErrors,
  createStorageErrorLog,
  getServerStorageErrors,
  recordStorageError,
  sharedStorageErrorLog,
} from "../error-log";

function failure(message: string): PlatformStorageError {
  return new PlatformStorageError(STORAGE_ERROR_CODE.Validation, message);
}

/* The shared log is one collector for the page, as an `onError` observer has to be, so each test starts from empty. */
beforeEach(() => {
  clearStorageErrors();
});

describe("createStorageErrorLog", () => {
  it("publishes at once while nothing is listening, so a server reads it right after the read", () => {
    const log = createStorageErrorLog();

    log.record(failure("first"));

    expect(log.entries().map((entry) => entry.error.message)).toEqual(["first"]);
  });

  it("holds a failure for the end of the turn while something is listening", async () => {
    const log = createStorageErrorLog();
    log.subscribe(() => undefined);

    log.record(failure("first"));

    expect(log.entries()).toHaveLength(0);

    await Promise.resolve();

    expect(log.entries()).toHaveLength(1);
  });

  it("tells its listeners once for a batch rather than once per failure", async () => {
    const log = createStorageErrorLog();
    const listener = vi.fn();
    log.subscribe(listener);

    log.record(failure("first"));
    log.record(failure("second"));
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(log.entries()).toHaveLength(2);
  });

  it("stops telling a listener once it unsubscribes", async () => {
    const log = createStorageErrorLog();
    const listener = vi.fn();
    const stop = log.subscribe(listener);

    stop();
    log.record(failure("first"));
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the order failures arrived in when the last listener leaves between them", async () => {
    const log = createStorageErrorLog();
    const stop = log.subscribe(() => undefined);

    log.record(failure("first"));
    stop();
    log.record(failure("second"));

    expect(log.entries().map((entry) => entry.error.message)).toEqual(["second", "first"]);

    await Promise.resolve();

    expect(log.entries()).toHaveLength(2);
  });

  it("answers with the same array until something changes", () => {
    const log = createStorageErrorLog();

    expect(log.entries()).toBe(log.entries());

    log.record(failure("first"));
    const after = log.entries();

    expect(log.entries()).toBe(after);
  });

  it("keeps two logs apart", () => {
    const first = createStorageErrorLog();
    const second = createStorageErrorLog();

    first.record(failure("first"));

    expect(first.entries()).toHaveLength(1);
    expect(second.entries()).toHaveLength(0);
    expect(sharedStorageErrorLog.entries()).toHaveLength(0);
  });

  it("collapses an identical repeat into a count", () => {
    const log = createStorageErrorLog();

    log.record(failure("same"));
    log.record(failure("same"));

    const [entry] = log.entries();

    expect(log.entries()).toHaveLength(1);
    expect(entry?.count).toBe(2);
  });

  it("keeps failures that differ apart, newest first", () => {
    const log = createStorageErrorLog();

    log.record(failure("one"));
    log.record(failure("two"));

    expect(log.entries().map((entry) => entry.error.message)).toStrictEqual(["two", "one"]);
  });

  it("carries the error itself, not a copy of its fields", () => {
    const log = createStorageErrorLog();
    const error = failure("the original");

    log.record(error);

    expect(log.entries()[0]?.error).toBe(error);
  });

  it("gives each entry an id of its own", () => {
    const log = createStorageErrorLog();

    log.record(failure("one"));
    log.record(failure("two"));

    const [newest, oldest] = log.entries();

    expect(newest?.id).not.toBe(oldest?.id);
  });

  it("keeps the newest and drops the rest rather than growing without end", () => {
    const log = createStorageErrorLog();

    for (let index = 0; index < 60; index += 1) log.record(failure(`failure ${index}`));

    expect(log.entries()).toHaveLength(50);
    expect(log.entries()[0]?.error.message).toBe("failure 59");
  });

  it("empties on clear and says so", () => {
    const log = createStorageErrorLog();
    const listener = vi.fn();
    log.record(failure("first"));

    log.subscribe(listener);
    log.clear();

    expect(log.entries()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("the shared log", () => {
  it("collects what recordStorageError is handed", () => {
    recordStorageError(failure("first"));

    expect(sharedStorageErrorLog.entries().map((entry) => entry.error.message)).toEqual(["first"]);
  });

  it("still holds a failure for the end of the turn while something is listening", async () => {
    const stop = sharedStorageErrorLog.subscribe(() => undefined);

    recordStorageError(failure("first"));

    expect(sharedStorageErrorLog.entries()).toHaveLength(0);

    await Promise.resolve();
    stop();

    expect(sharedStorageErrorLog.entries()).toHaveLength(1);
  });

  it("empties through clearStorageErrors and says so", () => {
    const listener = vi.fn();
    recordStorageError(failure("first"));

    const stop = sharedStorageErrorLog.subscribe(listener);
    clearStorageErrors();
    stop();

    expect(sharedStorageErrorLog.entries()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("answers with the same empty array on a server, so a snapshot holds still", () => {
    expect(getServerStorageErrors()).toBe(getServerStorageErrors());
    expect(getServerStorageErrors()).toHaveLength(0);
  });
});
