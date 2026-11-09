import * as z from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineKey,
  defineStorageSchema,
  defineVersions,
  UnknownStorageVersionError,
} from "../src/index";
import type { JsonValue, PlatformStorageError, StandardSchemaV1 } from "../src/index";
import { areaAdapter, feedAdapter, gate } from "./fakes/adapters";
import type { FeedAdapter } from "./fakes/adapters";

const v1 = z.object({ id: z.string() });
const v2 = z.object({ id: z.string(), email: z.string() });

const chain = defineVersions(v1).next(v2, (previous) => ({ ...previous, email: "e@x" }));
const prefsSchema = z.object({ compact: z.boolean() });

const wire = (value: unknown): string => JSON.stringify(value);
const migrated = (id: string): string => wire({ v: 2, d: { id, email: "e@x" } });

/** Lets every queued delivery run, for asserting that nothing arrived. */
async function settled(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface Following {
  readonly adapter: FeedAdapter;
  readonly changes: Array<{ oldValue: unknown; newValue: unknown }>;
  readonly keys: Array<string | undefined>;
  readonly errors: Array<PlatformStorageError>;
}

function following(
  definition: Parameters<typeof defineStorageSchema>[0],
  reportsOwnWrites = false,
): Following {
  const adapter = feedAdapter({}, reportsOwnWrites);
  const errors: Array<PlatformStorageError> = [];
  const storage = createStorage({
    schema: defineStorageSchema(definition as { user: typeof chain }),
    adapter,
    onError: (error) => {
      errors.push(error);
    },
  });
  const changes: Following["changes"] = [];
  const keys: Following["keys"] = [];

  storage.watch("user", ({ oldValue, newValue }) => {
    changes.push({ oldValue, newValue });
  });
  storage.onChange((key) => {
    keys.push(key);
  });

  return { adapter, changes, keys, errors };
}

describe("the echo of a saved migration", () => {
  it("reaches nobody, whether from this context or another", async () => {
    const { adapter, changes, keys } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("1") });
    await settled();

    expect(changes).toEqual([]);
    expect(keys).toEqual([]);
  });

  it("stays silent from a stored version part way along the chain", async () => {
    const v3 = z.object({ id: z.string(), email: z.string(), name: z.string() });
    const longer = chain.next(v3, (previous) => ({ ...previous, name: "N" }));
    const { adapter, changes, keys } = following({ user: longer });

    adapter.emit({
      key: "user",
      oldValue: wire({ v: 2, d: { id: "1", email: "kept" } }),
      newValue: wire({ v: 3, d: { id: "1", email: "kept", name: "N" } }),
    });
    await settled();

    expect(changes).toEqual([]);
    expect(keys).toEqual([]);
  });

  it("waits for a validator that answers later before deciding", async () => {
    const paused = gate();
    const slow: StandardSchemaV1<{ id: string }, { id: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: async (value) => {
          await paused.opened;

          return { value: value as { id: string } };
        },
      },
    };
    const key = defineVersions(slow).next(v2, (previous) => ({ ...previous, email: "e@x" }));
    const { adapter, keys } = following({ user: key });

    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("1") });
    await settled();
    paused.open();
    await settled();

    expect(keys).toEqual([]);
  });
});

describe("a real change to a key that can be repaired", () => {
  it("is delivered, with the old value read through the chain", async () => {
    const { adapter, changes, keys } = following({ user: chain });

    adapter.emit({
      key: "user",
      oldValue: wire({ id: "1" }),
      newValue: wire({ v: 2, d: { id: "2", email: "other" } }),
    });

    await vi.waitFor(() => {
      expect(changes).toEqual([
        {
          oldValue: { id: "1", email: "e@x" },
          newValue: { id: "2", email: "other" },
        },
      ]);
    });
    expect(keys).toEqual(["user"]);
  });

  it("is delivered between two values already at the latest version", async () => {
    const { adapter, changes } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: migrated("1"), newValue: migrated("2") });

    await vi.waitFor(() => {
      expect(changes).toHaveLength(1);
    });
  });

  it("is delivered when the saved form would read as a different value", async () => {
    const exclaiming = defineVersions(z.string()).next(
      z.string().transform((value) => `${value}!`),
      (previous) => previous,
    );
    const { adapter, keys } = following({ user: exclaiming });

    adapter.emit({ key: "user", oldValue: '"a"', newValue: wire({ v: 2, d: "a!" }) });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });

  it("is delivered when another context writes an identical value at the latest version", async () => {
    const { adapter, keys } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: migrated("1"), newValue: migrated("1") });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });

  it("is delivered when a key's first value arrives or its last is removed", async () => {
    const { adapter, changes } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: undefined, newValue: migrated("1") });
    adapter.emit({ key: "user", oldValue: migrated("1"), newValue: undefined });

    await vi.waitFor(() => {
      expect(changes).toHaveLength(2);
    });
  });

  it("is delivered when a step gives a different answer each time, costing one extra read", async () => {
    let calls = 0;
    const key = defineVersions(v1).next(v2, (previous) => {
      calls += 1;

      return { ...previous, email: String(calls) };
    });
    const { adapter, keys } = following({ user: key });

    adapter.emit({
      key: "user",
      oldValue: wire({ id: "1" }),
      newValue: wire({ v: 2, d: { id: "1", email: "first" } }),
    });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });

  it("is delivered as the fallback beside a context running a later release", async () => {
    const { adapter, changes, errors } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: migrated("1"), newValue: wire({ v: 3, d: "future" }) });

    await vi.waitFor(() => {
      expect(changes).toEqual([{ oldValue: { id: "1", email: "e@x" }, newValue: undefined }]);
    });
    expect(errors[0]).toBeInstanceOf(UnknownStorageVersionError);
  });

  it("is delivered when the old value cannot be repaired at all", async () => {
    const { adapter, keys, errors } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: wire(7), newValue: migrated("1") });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
    expect(errors).toHaveLength(1);
  });

  it("is delivered when the value in the old form cannot be serialized", async () => {
    const key = defineVersions(z.number()).next(z.bigint(), (previous) => BigInt(previous));
    const { adapter, keys } = following({ user: key });

    adapter.emit({ key: "user", oldValue: "1", newValue: "2" });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });
});

describe("the echo of a saved recover", () => {
  const prefs = defineKey(prefsSchema, {
    recover: (raw) =>
      typeof raw === "object" && raw !== null && "dense" in raw
        ? { compact: raw.dense === true }
        : undefined,
  });

  it("reaches nobody", async () => {
    const { adapter, keys, changes } = following({ user: prefs });

    adapter.emit({
      key: "user",
      oldValue: wire({ dense: true }),
      newValue: wire({ compact: true }),
    });
    await settled();

    expect(keys).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("is delivered when the new value is not the repair", async () => {
    const { adapter, keys } = following({ user: prefs });

    adapter.emit({
      key: "user",
      oldValue: wire({ dense: true }),
      newValue: wire({ compact: false }),
    });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });

  it("does not report a failing recover twice while deciding", async () => {
    const throwing = {
      schema: prefsSchema,
      recover: () => {
        throw new Error("nope");
      },
    };
    const { adapter, keys, errors } = following({ user: throwing });

    adapter.emit({ key: "user", oldValue: wire(7), newValue: wire({ compact: true }) });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
    await settled();

    /* Once for the failing recover and once for the original failure, from the one decode that reports. */
    expect(errors).toHaveLength(2);
  });
});

describe("what deciding must not cost", () => {
  it("still announces when the answer cannot be worked out", async () => {
    const throwing: StandardSchemaV1<{ id: string }, { id: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => {
          throw new Error("validator broke");
        },
      },
    };
    const key = defineVersions(throwing).next(v2, (previous) => ({ ...previous, email: "e" }));
    const { adapter, keys } = following({ user: key });

    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("1") });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });

  it("still announces when an asynchronous answer is rejected", async () => {
    const rejecting: StandardSchemaV1<{ id: string }, { id: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => Promise.reject(new Error("validator broke")),
      },
    };
    const key = defineVersions(rejecting).next(v2, (previous) => ({ ...previous, email: "e" }));
    const { adapter, keys } = following({ user: key });

    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("1") });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
  });

  it("delivers to whoever was listening when the change arrived", async () => {
    const paused = gate();
    const slow: StandardSchemaV1<{ id: string }, { id: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: async (value) => {
          await paused.opened;

          return { value: value as { id: string } };
        },
      },
    };
    const key = defineVersions(slow).next(v2, (previous) => ({ ...previous, email: "e@x" }));
    const adapter = feedAdapter();
    const storage = createStorage({ schema: defineStorageSchema({ user: key }), adapter });
    const early = vi.fn();
    const late = vi.fn();

    storage.onChange(early);
    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("2") });
    storage.onChange(late);
    paused.open();

    await vi.waitFor(() => {
      expect(early).toHaveBeenCalledWith("user");
    });
    expect(late).not.toHaveBeenCalled();
  });

  it("announces before delivering, as every other change does", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });
    const order: Array<string> = [];

    storage.onChange(() => order.push("announced"));
    storage.watch("user", () => order.push("delivered"));
    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("2") });

    await vi.waitFor(() => {
      expect(order).toEqual(["announced", "delivered"]);
    });
  });

  it("writes nothing", async () => {
    const { adapter } = following({ user: chain });

    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("1") });
    await settled();

    expect(adapter.calls).toEqual([]);
  });
});

describe("the writes this storage reports for itself", () => {
  it("are announced even when they equal what a repair would have written", async () => {
    const adapter = feedAdapter({ user: wire({ id: "1" }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });
    const keys: Array<string | undefined> = [];

    /* A watcher is what makes the write look up what it replaces, which is the only way it could resemble a repair. */
    storage.watch("user", () => undefined);
    storage.onChange((key) => keys.push(key));
    await storage.set("user", { id: "1", email: "e@x" });

    expect(keys).toEqual(["user"]);
  });
});

describe("a key with neither versions nor recover", () => {
  it("is announced whatever the two stored forms are", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ user: { schema: v1 } }),
      adapter,
    });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: wire({ id: "1" }) });

    expect(keys).toEqual(["user"]);
  });
});

describe("when deciding is skipped altogether", () => {
  it("announces at once for a key with nothing to repair, whatever its validator is doing", () => {
    const pending: StandardSchemaV1<{ id: string }, { id: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => gate().opened.then(() => ({ value: { id: "" } })),
      },
    };
    const adapter = feedAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ user: { schema: pending } }),
      adapter,
    });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: wire({ id: "2" }) });

    expect(keys).toEqual(["user"]);
  });

  it("never asks recover about a key that held nothing", async () => {
    const recover = vi.fn(() => undefined);
    const adapter = feedAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ user: defineKey(v1, { recover }) }),
      adapter,
    });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    adapter.emit({ key: "user", oldValue: undefined, newValue: wire({ id: "1" }) });

    await vi.waitFor(() => {
      expect(keys).toEqual(["user"]);
    });
    await settled();

    expect(recover).not.toHaveBeenCalled();
  });
});

describe("a saved migration in a backend reporting its own writes", () => {
  it("is silent end to end", async () => {
    const adapter = feedAdapter({ user: wire({ id: "1" }) }, true);
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });
    const keys: Array<string | undefined> = [];

    storage.onChange((key) => keys.push(key));
    await storage.get("user");
    adapter.emit({ key: "user", oldValue: wire({ id: "1" }), newValue: migrated("1") });
    await settled();

    expect(adapter.entries.get("user")).toBe(migrated("1"));
    expect(keys).toEqual([]);
  });
});

const area = (stored: JsonValue) => {
  const adapter = areaAdapter({ user: stored });
  const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });
  const keys: Array<string | undefined> = [];

  storage.onChange((key) => keys.push(key));

  return { adapter, storage, keys };
};

describe("a backend that sorts object keys and drops undefined", () => {
  it("saves over data it receives as a fresh object each time", async () => {
    const { adapter, storage } = area({ id: "1" });

    await storage.get("user");

    expect(adapter.peek("user")).toEqual({ d: { email: "e@x", id: "1" }, v: 2 });
  });

  it("stays silent about its own save, whatever order the keys come back in", async () => {
    const { storage, keys } = area({ id: "1" });

    await storage.get("user");
    await settled();

    expect(keys).toEqual([]);
  });

  it("never saves a step's undefined, which such a backend would store as no envelope at all", async () => {
    const errors: Array<PlatformStorageError> = [];
    const adapter = areaAdapter({ nick: "a" });
    const storage = createStorage({
      schema: defineStorageSchema({
        nick: defineVersions(z.string()).next(z.string().optional(), () => undefined),
      }),
      adapter,
      onError: (error) => {
        errors.push(error);
      },
    });

    expect(await storage.get("nick")).toBeUndefined();
    expect(adapter.peek("nick")).toBe("a");
    expect(errors).toHaveLength(1);
  });
});

describe("a context still on code from before the key had versions", () => {
  const envelope = wire({ v: 2, d: { id: "1", email: "e" } });

  it("falls back on an envelope, which it sees as invalid data", async () => {
    const adapter = feedAdapter({ user: envelope });
    const storage = createStorage({
      schema: defineStorageSchema({ user: { schema: v1 } }),
      adapter,
    });

    expect(await storage.get("user")).toBeUndefined();
    expect(adapter.entries.get("user")).toBe(envelope);
  });

  it("deletes an envelope under the remove policy, which is why that policy goes first", async () => {
    const adapter = feedAdapter({ user: envelope });
    const storage = createStorage({
      schema: defineStorageSchema({ user: { schema: v1 } }),
      adapter,
      onInvalid: "remove",
    });

    await storage.get("user");

    expect(adapter.entries.has("user")).toBe(false);
  });
});
