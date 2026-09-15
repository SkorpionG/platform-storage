import { createStorage, jsonSerializer } from "@platform-storage/core";
import { describe, expect, it, vi } from "vitest";

import { testSchema } from "../../../tests/fakes/schema";

import { asyncStorage, failingStorage } from "../../../tests/fakes/storages";
import {
  getAsyncValueServerSnapshot,
  getAsyncValueSnapshot,
  subscribeToAsyncValue,
} from "../async-cache";
import { notifyStorageChanged } from "../changes";

/* The read is started by the subscription and settles on its own, so a test waits for the listener rather than for a promise it does not hold. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("getAsyncValueSnapshot", () => {
  it("says it has not answered yet before anything is read", () => {
    const storage = asyncStorage();

    expect(getAsyncValueSnapshot(storage, "theme").status).toBe("loading");
  });

  it("holds the same reference while it is still loading", () => {
    const storage = asyncStorage();

    expect(getAsyncValueSnapshot(storage, "theme")).toBe(getAsyncValueSnapshot(storage, "theme"));
  });

  it("answers with the schema's default once the read lands", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    expect(getAsyncValueSnapshot(storage, "theme")).toStrictEqual({
      status: "ready",
      value: "system",
      error: undefined,
    });
  });

  it("reports a key that genuinely holds nothing as ready, not as loading", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValue(storage, "displayName", () => {});
    await settled();

    const snapshot = getAsyncValueSnapshot(storage, "displayName");

    expect(snapshot.status).toBe("ready");
    expect(snapshot.value).toBeUndefined();
  });

  it("holds its identity once ready, so a snapshot settles", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValue(storage, "recentSearches", () => {});
    await settled();

    expect(getAsyncValueSnapshot(storage, "recentSearches")).toBe(
      getAsyncValueSnapshot(storage, "recentSearches"),
    );
  });

  it("reports a refused read as failed, with the error the storage raised", async () => {
    const storage = failingStorage();
    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    const snapshot = getAsyncValueSnapshot(storage, "theme");

    expect(snapshot.status).toBe("failed");
    expect(snapshot.error?.code).toBe("ADAPTER");
  });

  it("reports a rejection that is not an error at all as one of this library's", async () => {
    const storage = createStorage({
      schema: testSchema,
      adapter: {
        name: "hostile",
        serializer: jsonSerializer,
        /* A backend is free to reject with anything, and the contract says nothing about what. */
        get: () => Promise.reject("nothing useful"),
        set: () => Promise.resolve(),
        remove: () => Promise.resolve(),
      },
    });

    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    const snapshot = getAsyncValueSnapshot(storage, "theme");

    /* The engine names the adapter and the operation whatever the backend threw, so a bare string never reaches a component. */
    expect(snapshot.status).toBe("failed");
    expect(snapshot.error?.code).toBe("ADAPTER");
    expect(snapshot.error?.message).toContain("hostile");
  });

  it("says nothing has been read on a server", () => {
    expect(getAsyncValueServerSnapshot().status).toBe("loading");
    expect(getAsyncValueServerSnapshot()).toBe(getAsyncValueServerSnapshot());
  });
});

describe("subscribeToAsyncValue", () => {
  it("reads once someone is listening, and says so", async () => {
    const storage = asyncStorage();
    const listener = vi.fn();

    subscribeToAsyncValue(storage, "theme", listener);
    await settled();

    expect(listener).toHaveBeenCalled();
  });

  it("reads again when the key changes", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    await storage.set("theme", "dark");
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(getAsyncValueSnapshot(storage, "theme").value).toBe("dark");
  });

  it("keeps the previous answer on screen while it reads again", async () => {
    const storage = asyncStorage(5);
    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getAsyncValueSnapshot(storage, "theme").value).toBe("system");

    notifyStorageChanged(storage, "theme");

    /* Mid-read: the value is the one already shown, not a spinner. */
    expect(getAsyncValueSnapshot(storage, "theme").status).toBe("ready");
    expect(getAsyncValueSnapshot(storage, "theme").value).toBe("system");
  });

  it("settles on the later write when two reads resolve out of order", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    await storage.set("theme", "dark");
    notifyStorageChanged(storage, "theme");
    await storage.set("theme", "light");
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(getAsyncValueSnapshot(storage, "theme").value).toBe("light");
  });

  it("stops reading once the last listener leaves", async () => {
    const storage = asyncStorage();
    const listener = vi.fn();

    const unsubscribe = subscribeToAsyncValue(storage, "theme", listener);
    await settled();
    listener.mockClear();
    unsubscribe();

    notifyStorageChanged(storage, "theme");
    await settled();

    expect(listener).not.toHaveBeenCalled();
  });

  it("catches up on a change that happened while nobody was watching", async () => {
    const storage = asyncStorage();
    const unsubscribe = subscribeToAsyncValue(storage, "theme", () => {});
    await settled();
    unsubscribe();

    await storage.set("theme", "dark");
    notifyStorageChanged(storage, "theme");

    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    expect(getAsyncValueSnapshot(storage, "theme").value).toBe("dark");
  });
});
