import { createStorage, jsonSerializer } from "@platform-storage/core";
import { describe, expect, it, vi } from "vitest";

import { testSchema } from "../../../tests/fakes/schema";
import type { TestKey } from "../../../tests/fakes/schema";

import { asyncStorage, failingStorage } from "../../../tests/fakes/storages";
import {
  getAsyncValueServerSnapshot,
  getAsyncValueSnapshot,
  subscribeToAsyncValue,
} from "../async-cache";
import { notifyStorageChanged } from "../changes";

/* The read is started by the subscription and settles on its own, so a test waits for the listener rather than for a promise it does not hold. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

  /*
    The hooks take any storage-shaped object, not only one `createStorage` built, so nothing guarantees a rejection has been through the engine. Reporting a raw one as itself would hand a component something with no `code` to read.
  */
  it("names a rejection that never went through the engine, so a component always gets a code", async () => {
    const storage = {
      ...asyncStorage(),
      get: () => Promise.reject(new Error("straight from somewhere else")),
    };

    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    const snapshot = getAsyncValueSnapshot(storage, "theme");

    expect(snapshot.status).toBe("failed");
    expect(snapshot.error?.code).toBe("ADAPTER");
    expect(snapshot.error?.message).toBe("straight from somewhere else");
  });

  it("says so when even the reason is unrecognizable", async () => {
    const storage = { ...asyncStorage(), get: () => Promise.reject("a bare string") };

    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    expect(getAsyncValueSnapshot(storage, "theme").error?.message).toBe(
      "The storage failed for an unknown reason.",
    );
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
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

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

  it("reads nothing again when nobody wrote while nobody was watching", async () => {
    const storage = asyncStorage();
    const reads = vi.spyOn(storage, "get");

    const unsubscribe = subscribeToAsyncValue(storage, "theme", () => {});
    await settled();
    unsubscribe();
    reads.mockClear();

    subscribeToAsyncValue(storage, "theme", () => {});
    await settled();

    expect(reads).not.toHaveBeenCalled();
  });

  it("starts one read for several listeners, and keeps watching until the last leaves", async () => {
    const storage = asyncStorage();
    const reads = vi.spyOn(storage, "get");
    const second = vi.fn();

    const unsubscribeFirst = subscribeToAsyncValue(storage, "theme", () => {});
    subscribeToAsyncValue(storage, "theme", second);
    await settled();

    expect(reads).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    second.mockClear();
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(second).toHaveBeenCalled();
  });
});

/*
  Two reads of one key can be in flight at once, because a change starts a new one without waiting for the old. Whichever started later is the current answer, so an earlier result has to be dropped rather than published over it.
*/
/** A storage whose first read is slow and whose later reads are immediate, so the first always lands last. */
function slowFirstRead(first: () => Promise<unknown>) {
  let attempt = 0;

  return {
    ...asyncStorage(),
    get: (_key: TestKey) => {
      attempt += 1;

      return attempt === 1 ? first() : Promise.resolve("dark");
    },
  } as unknown as ReturnType<typeof asyncStorage>;
}

const after = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("a read that a later one has superseded", () => {
  it("is dropped rather than published over the newer answer", async () => {
    const storage = slowFirstRead(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve("light"), 30);
        }),
    );

    subscribeToAsyncValue(storage, "theme", () => {});
    /* No await: the second read has to start while the first is still in flight. */
    notifyStorageChanged(storage, "theme");

    await after(80);

    const snapshot = getAsyncValueSnapshot(storage, "theme");

    expect(snapshot.status).toBe("ready");
    expect(snapshot.value).toBe("dark");
  });

  it("is dropped when it failed too, so a stale failure cannot replace a good value", async () => {
    const storage = slowFirstRead(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("slow failure")), 30);
        }),
    );

    subscribeToAsyncValue(storage, "theme", () => {});
    notifyStorageChanged(storage, "theme");

    await after(80);

    const snapshot = getAsyncValueSnapshot(storage, "theme");

    expect(snapshot.status).toBe("ready");
    expect(snapshot.value).toBe("dark");
  });
});
