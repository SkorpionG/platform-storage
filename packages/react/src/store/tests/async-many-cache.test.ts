import { describe, expect, it, vi } from "vitest";

import { asyncStorage, failingStorage } from "../../../tests/fakes/storages";
import {
  getAsyncValuesServerSnapshot,
  getAsyncValuesSnapshot,
  subscribeToAsyncValues,
} from "../async-many-cache";
import { notifyStorageChanged } from "../changes";

/* The read is started by the subscription and settles on its own, so a test waits for the listener rather than for a promise it does not hold. */
function settled(milliseconds = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe("getAsyncValuesSnapshot", () => {
  it("says it has not answered yet, with the same reference, before anything is read", () => {
    const storage = asyncStorage();
    const first = getAsyncValuesSnapshot(storage, ["theme", "user"]);

    expect(first.status).toBe("loading");
    expect(getAsyncValuesSnapshot(storage, ["theme", "user"])).toBe(first);
  });

  it("answers with every key in one read once it lands", async () => {
    const storage = asyncStorage();
    const reads = vi.spyOn(storage, "getMany");
    await storage.set("user", { id: "u_1", name: "Ada" });

    subscribeToAsyncValues(storage, ["theme", "user", "displayName"], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme", "user", "displayName"])).toStrictEqual({
      status: "ready",
      values: { displayName: undefined, theme: "system", user: { id: "u_1", name: "Ada" } },
      error: undefined,
    });
    expect(reads).toHaveBeenCalledExactlyOnceWith(["displayName", "theme", "user"]);
  });

  it("holds its identity once ready, so a snapshot settles", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValues(storage, ["recentSearches"], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["recentSearches"])).toBe(
      getAsyncValuesSnapshot(storage, ["recentSearches"]),
    );
  });

  it("shares one state between lists naming the same keys", async () => {
    const storage = asyncStorage();
    const reads = vi.spyOn(storage, "getMany");

    subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    subscribeToAsyncValues(storage, ["user", "theme", "user"], () => {});
    await settled();

    expect(reads).toHaveBeenCalledOnce();
    expect(getAsyncValuesSnapshot(storage, ["user", "theme"])).toBe(
      getAsyncValuesSnapshot(storage, ["theme", "user"]),
    );
  });

  it("answers an empty list with an empty object", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValues(storage, [], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, [])).toStrictEqual({
      status: "ready",
      values: {},
      error: undefined,
    });
  });

  it("reports a refused read as failed, with the error the storage raised", async () => {
    const storage = failingStorage();
    subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();

    const snapshot = getAsyncValuesSnapshot(storage, ["theme", "user"]);

    expect(snapshot.status).toBe("failed");
    expect(snapshot.values).toBeUndefined();
    expect(snapshot.error?.code).toBe("ADAPTER");
  });

  it("names a rejection that never went through the engine, so a component always gets a code", async () => {
    const storage = { ...asyncStorage(), getMany: () => Promise.reject("a bare string") };

    subscribeToAsyncValues(storage, ["theme"], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme"]).error?.message).toBe(
      "The storage failed for an unknown reason.",
    );
  });

  it("says nothing has been read on a server", () => {
    expect(getAsyncValuesServerSnapshot().status).toBe("loading");
    expect(getAsyncValuesServerSnapshot()).toBe(getAsyncValuesServerSnapshot());
  });
});

describe("subscribeToAsyncValues", () => {
  it("reads again when one of its keys changes", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();

    await storage.set("theme", "dark");
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme", "user"]).values?.theme).toBe("dark");
  });

  it("reads nothing when a key outside it changes", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();
    const reads = vi.spyOn(storage, "getMany");

    notifyStorageChanged(storage, "visitCount");
    await settled();

    expect(reads).not.toHaveBeenCalled();
  });

  it("reads once for a change naming every key, not once per key", async () => {
    const storage = asyncStorage();
    subscribeToAsyncValues(storage, ["theme", "user", "visitCount"], () => {});
    await settled();
    const reads = vi.spyOn(storage, "getMany");

    notifyStorageChanged(storage);
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(reads).toHaveBeenCalledOnce();
  });

  it("keeps the previous answer on screen while it reads again", async () => {
    const storage = asyncStorage(5);
    subscribeToAsyncValues(storage, ["theme"], () => {});
    await settled(20);

    notifyStorageChanged(storage, "theme");
    await Promise.resolve();

    expect(getAsyncValuesSnapshot(storage, ["theme"])).toMatchObject({
      status: "ready",
      values: { theme: "system" },
    });
  });

  it("drops a read a change overtook, and shows only the read after it", async () => {
    const storage = asyncStorage();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = storage.getMany.bind(storage);
    const reads = vi.spyOn(storage, "getMany").mockImplementationOnce(async (keys) => {
      const answer = await real(keys);
      await held;

      return answer;
    });
    const listener = vi.fn();

    subscribeToAsyncValues(storage, ["theme"], listener);
    await settled();
    await storage.set("theme", "dark");
    release?.();

    await vi.waitFor(() => {
      expect(getAsyncValuesSnapshot(storage, ["theme"]).values?.theme).toBe("dark");
    });
    expect(reads).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("drops a refusal a later read overtook, keeping the later answer", async () => {
    const storage = asyncStorage();
    let refuse: (() => void) | undefined;
    vi.spyOn(storage, "getMany").mockReturnValueOnce(
      new Promise((_, reject) => {
        refuse = () => {
          reject(new Error("refused"));
        };
      }),
    );

    subscribeToAsyncValues(storage, ["theme"], () => {});
    await settled();
    await storage.set("theme", "dark");
    await settled();
    refuse?.();
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme"])).toMatchObject({
      status: "ready",
      values: { theme: "dark" },
    });
  });

  it("drops an answer that lands after a change has asked for another read", async () => {
    const storage = asyncStorage();
    let answer: ((values: Record<string, unknown>) => void) | undefined;
    let replacement: ((values: Record<string, unknown>) => void) | undefined;
    vi.spyOn(storage, "getMany")
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        }) as never,
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          replacement = resolve;
        }) as never,
      );
    const published: Array<unknown> = [];

    subscribeToAsyncValues(storage, ["theme"], () => {
      published.push(getAsyncValuesSnapshot(storage, ["theme"]));
    });
    await settled();

    /* The first answer lands and the change arrives in the same turn, before the answer is handled. */
    answer?.({ theme: "light" });
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(published).toEqual([]);
    expect(getAsyncValuesSnapshot(storage, ["theme"]).status).toBe("loading");

    replacement?.({ theme: "dark" });
    await settled();

    expect(published).toEqual([{ status: "ready", values: { theme: "dark" }, error: undefined }]);
  });

  it("drops a refusal that lands after a change has asked for another read", async () => {
    const storage = asyncStorage();
    let refuse: (() => void) | undefined;
    let replacement: ((values: Record<string, unknown>) => void) | undefined;
    vi.spyOn(storage, "getMany")
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          refuse = () => {
            reject(new Error("refused"));
          };
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          replacement = resolve;
        }) as never,
      );
    const published: Array<string> = [];

    subscribeToAsyncValues(storage, ["theme"], () => {
      published.push(getAsyncValuesSnapshot(storage, ["theme"]).status);
    });
    await settled();

    refuse?.();
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(published).toEqual([]);

    replacement?.({ theme: "dark" });
    await settled();

    expect(published).toEqual(["ready"]);
  });

  it("is not held back by a read the backend never settles", async () => {
    const storage = asyncStorage();
    vi.spyOn(storage, "getMany").mockReturnValueOnce(new Promise(() => {}));

    subscribeToAsyncValues(storage, ["theme"], () => {});
    await settled();
    await storage.set("theme", "dark");
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme"])).toMatchObject({
      status: "ready",
      values: { theme: "dark" },
    });
  });

  it("recovers from a failed read on the next change", async () => {
    const storage = asyncStorage();
    const refuse = vi.spyOn(storage, "getMany").mockRejectedValueOnce(new Error("refused"));

    subscribeToAsyncValues(storage, ["theme"], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme"]).status).toBe("failed");

    refuse.mockRestore();
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme"]).status).toBe("ready");
  });

  it("stops reading once the last listener leaves", async () => {
    const storage = asyncStorage();
    const listener = vi.fn();

    const unsubscribe = subscribeToAsyncValues(storage, ["theme", "user"], listener);
    const second = subscribeToAsyncValues(storage, ["user", "theme"], () => {});
    await settled();
    listener.mockClear();
    unsubscribe();
    second();
    const reads = vi.spyOn(storage, "getMany");

    notifyStorageChanged(storage, "theme");
    await settled();

    expect(reads).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps reading for the listeners still attached", async () => {
    const storage = asyncStorage();

    const first = subscribeToAsyncValues(storage, ["theme"], () => {});
    subscribeToAsyncValues(storage, ["theme"], () => {});
    await settled();
    first();

    await storage.set("theme", "dark");
    notifyStorageChanged(storage, "theme");
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme"]).values?.theme).toBe("dark");
  });

  it("catches up on a change that happened while nobody was watching", async () => {
    const storage = asyncStorage();
    const unsubscribe = subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();
    unsubscribe();

    await storage.set("theme", "dark");
    notifyStorageChanged(storage, "theme");

    subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme", "user"]).values?.theme).toBe("dark");
  });

  it("reads nothing again while something else kept every key followed", async () => {
    const storage = asyncStorage();

    subscribeToAsyncValues(storage, ["visitCount"], () => {});

    const unsubscribe = subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();
    unsubscribe();
    const reads = vi.spyOn(storage, "getMany");

    subscribeToAsyncValues(storage, ["theme", "user"], () => {});
    await settled();

    expect(reads).not.toHaveBeenCalled();
  });

  it("reports an undeclared key as a failed read rather than throwing", async () => {
    const storage = asyncStorage();

    subscribeToAsyncValues(storage, ["theme", "nope" as "theme"], () => {});
    await settled();

    expect(getAsyncValuesSnapshot(storage, ["theme", "nope" as "theme"]).error?.code).toBe(
      "UNKNOWN_KEY",
    );
  });
});
