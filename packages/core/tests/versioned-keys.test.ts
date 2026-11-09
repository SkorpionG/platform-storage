import * as z from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  defineVersions,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageMigrationError,
  StorageValidationError,
  UnknownStorageVersionError,
} from "../src/index";
import type {
  InvalidContext,
  OnInvalid,
  PlatformStorageError,
  StandardSchemaV1,
} from "../src/index";
import { asyncStringSchema, themeSchema } from "./fixtures/schemas";
import { asyncOnlyAdapter, feedAdapter, jsonValueAdapter } from "./fakes/adapters";

const v1 = z.object({ id: z.string() });
const v2 = z.object({ id: z.string(), email: z.string() });
const v3 = z.object({ id: z.string(), email: z.string(), name: z.string() });

const latest = { id: "1", email: "e@x", name: "N" };

const chain = defineVersions(v1)
  .next(v2, (previous) => ({ ...previous, email: "e@x" }))
  .next(v3, (previous) => ({ ...previous, name: "N" }));

function harness(stored?: unknown, onInvalid?: OnInvalid<unknown>) {
  const errors: Array<PlatformStorageError> = [];
  const adapter = memoryAdapter({
    initial: stored === undefined ? {} : { user: JSON.stringify(stored) },
  });
  const storage = createStorage({
    schema: defineStorageSchema({ user: chain }),
    adapter,
    onInvalid,
    onError: (error) => {
      errors.push(error);
    },
  });

  return { storage, errors, held: () => adapter.entries.get("user") };
}

describe("writing a versioned key", () => {
  it("stores the value inside an envelope naming the latest version", async () => {
    const { storage, held } = harness();

    await storage.set("user", latest);

    expect(JSON.parse(held() as string)).toEqual({ v: 3, d: latest });
  });

  it("reads back what it wrote", async () => {
    const { storage } = harness();

    await storage.set("user", latest);

    expect(await storage.get("user")).toEqual(latest);
  });

  it("stores the envelope as a value on a backend transporting JSON values", async () => {
    const adapter = jsonValueAdapter();
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    await storage.set("user", latest);

    expect(adapter.getSync("user")).toEqual({ v: 3, d: latest });
    expect(await storage.get("user")).toEqual(latest);
  });

  it("removes the entry when the schema produces undefined, as any key does", async () => {
    const optional = defineVersions(z.string().optional());
    const adapter = memoryAdapter({ initial: { nick: JSON.stringify({ v: 1, d: "a" }) } });
    const storage = createStorage({ schema: defineStorageSchema({ nick: optional }), adapter });

    await storage.set("nick", undefined);

    expect(adapter.entries.has("nick")).toBe(false);
  });

  it("leaves a key without versions bare beside a versioned one", async () => {
    const adapter = memoryAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: themeSchema }, user: chain }),
      adapter,
    });

    await storage.set("theme", "dark");

    expect(adapter.entries.get("theme")).toBe('"dark"');
  });

  it("refuses a value in an older shape, since a write is always the latest version", async () => {
    const { storage, held } = harness();

    await expect(storage.set("user", { id: "1" } as typeof latest)).rejects.toBeInstanceOf(
      StorageValidationError,
    );
    expect(held()).toBeUndefined();
  });
});

describe("reading a versioned key", () => {
  it("answers with the default when nothing is stored, running no step", async () => {
    const up = vi.fn(() => latest);
    const key = defineVersions(v2).next(v3, up).options({ default: latest });
    const storage = createStorage({
      schema: defineStorageSchema({ user: key }),
      adapter: memoryAdapter(),
    });

    expect(await storage.get("user")).toEqual(latest);
    expect(up).not.toHaveBeenCalled();
  });

  it("reads an envelope at the latest version without running any step", async () => {
    const up = vi.fn(() => latest);
    const key = defineVersions(v2).next(v3, up);
    const storage = createStorage({
      schema: defineStorageSchema({ user: key }),
      adapter: memoryAdapter({ initial: { user: JSON.stringify({ v: 2, d: latest }) } }),
    });

    expect(await storage.get("user")).toEqual(latest);
    expect(up).not.toHaveBeenCalled();
  });

  it("treats a bare value as version 1 and runs the whole chain", async () => {
    expect(await harness({ id: "1" }).storage.get("user")).toEqual(latest);
  });

  it("starts from the stored version, skipping the steps before it", async () => {
    const first = vi.fn((previous: { id: string }) => ({ ...previous, email: "first" }));
    const second = vi.fn((previous: { id: string; email: string }) => ({
      ...previous,
      name: "N",
    }));
    const key = defineVersions(v1).next(v2, first).next(v3, second);
    const storage = createStorage({
      schema: defineStorageSchema({ user: key }),
      adapter: memoryAdapter({
        initial: { user: JSON.stringify({ v: 2, d: { id: "1", email: "kept" } }) },
      }),
    });

    expect(await storage.get("user")).toEqual({ id: "1", email: "kept", name: "N" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("hands each step what the version before it produced", async () => {
    const trimmed = z.object({ id: z.string().transform((id) => id.trim()) });
    const up = vi.fn((previous: { id: string }) => ({ ...previous, email: "e" }));
    const key = defineVersions(trimmed).next(v2, up);
    const storage = createStorage({
      schema: defineStorageSchema({ user: key }),
      adapter: memoryAdapter({ initial: { user: JSON.stringify({ id: "  1  " }) } }),
    });

    await storage.get("user");

    expect(up).toHaveBeenCalledWith({ id: "1" });
  });

  it("migrates on a synchronous read too", () => {
    expect(harness({ id: "1" }).storage.getSync("user")).toEqual(latest);
  });

  it("migrates over a backend that only answers later", async () => {
    const adapter = {
      ...asyncOnlyAdapter,
      get: () => Promise.resolve(JSON.stringify({ id: "1" })),
    };
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    expect(await storage.get("user")).toEqual(latest);
  });

  it("reads a chain of one version, whose bare value is already current", async () => {
    const storage = createStorage({
      schema: defineStorageSchema({ user: defineVersions(v1) }),
      adapter: memoryAdapter({ initial: { user: JSON.stringify({ id: "1" }) } }),
    });

    expect(await storage.get("user")).toEqual({ id: "1" });
  });

  it("waits for a validator that answers later at each step", async () => {
    const key = defineVersions(asyncStringSchema).next(
      asyncStringSchema,
      (previous) => `${previous}!`,
    );
    const storage = createStorage({
      schema: defineStorageSchema({ note: key }),
      adapter: memoryAdapter({ initial: { note: '"hi"' } }),
    });

    expect(await storage.get("note")).toBe("hi!");
  });

  it("refuses a validator that answers later on a synchronous read, rather than failing the step", () => {
    const key = defineVersions(z.string()).next(asyncStringSchema, (previous) => previous);
    const storage = createStorage({
      schema: defineStorageSchema({ note: key }),
      adapter: memoryAdapter({ initial: { note: '"hi"' } }),
    });

    expect(() => storage.getSync("note")).toThrow(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.AsyncValidatorInSyncMode }),
    );
  });
});

describe("a value that fails its own version", () => {
  it("falls back and reports a validation failure", async () => {
    const { storage, errors, held } = harness({ v: 1, d: { nope: true } });

    expect(await storage.get("user")).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(StorageValidationError);
    expect(held()).toBeDefined();
  });

  it("hands a policy callback the value without its envelope", async () => {
    const seen: Array<InvalidContext> = [];
    const { storage } = harness({ v: 1, d: { nope: true } }, (context) => {
      seen.push(context);

      return latest;
    });

    expect(await storage.get("user")).toEqual(latest);
    expect(seen[0]?.raw).toEqual({ nope: true });
  });

  it("is deleted by the remove policy, being plain corruption", async () => {
    const { storage, held } = harness({ v: 2, d: 7 }, "remove");

    await storage.get("user");

    expect(held()).toBeUndefined();
  });

  it("reads a stored object that merely looks like an envelope as one", async () => {
    const { storage, errors } = harness({ v: 1, d: "x" });

    expect(await storage.get("user")).toBeUndefined();
    expect(errors[0]).toBeInstanceOf(StorageValidationError);
  });
});

describe.each<[string, unknown, new (...args: Array<never>) => Error, string]>([
  ["a value from a newer version", { v: 9, d: latest }, UnknownStorageVersionError, "newer"],
  [
    "a value a step cannot bring forward",
    { v: 1, d: { id: "boom" } },
    StorageMigrationError,
    "step",
  ],
])("%s", (_label, stored, errorClass) => {
  const failing = defineVersions(v1)
    .next(v2, (previous) => {
      if (previous.id === "boom") throw new Error("boom");

      return { ...previous, email: "e@x" };
    })
    .next(v3, (previous) => ({ ...previous, name: "N" }));

  function make(onInvalid?: OnInvalid<unknown>) {
    const errors: Array<PlatformStorageError> = [];
    const adapter = memoryAdapter({ initial: { user: JSON.stringify(stored) } });
    const storage = createStorage({
      schema: defineStorageSchema({ user: failing }),
      adapter,
      onInvalid,
      onError: (error) => {
        errors.push(error);
      },
    });

    return { storage, adapter, errors };
  }

  it("falls back by default and tells onError", async () => {
    const { storage, adapter, errors } = make();

    expect(await storage.get("user")).toBeUndefined();
    expect(errors[0]).toBeInstanceOf(errorClass);
    expect(JSON.parse(adapter.entries.get("user") as string)).toEqual(stored);
  });

  it("throws under the throw policy", async () => {
    await expect(make("throw").storage.get("user")).rejects.toBeInstanceOf(errorClass);
  });

  it("answers from a policy callback", async () => {
    expect(await make(() => latest).storage.get("user")).toEqual(latest);
  });

  it("survives the remove policy", async () => {
    const { storage, adapter } = make("remove");

    expect(await storage.get("user")).toBeUndefined();
    expect(JSON.parse(adapter.entries.get("user") as string)).toEqual(stored);
  });

  it("refuses an update, which would replace it with something worked out from a default", async () => {
    const updater = vi.fn(() => latest);
    const { storage, adapter } = make(() => latest);

    await expect(storage.update("user", updater)).rejects.toBeInstanceOf(errorClass);
    expect(updater).not.toHaveBeenCalled();
    expect(JSON.parse(adapter.entries.get("user") as string)).toEqual(stored);
  });

  it("refuses a synchronous update as well", () => {
    expect(() => {
      make().storage.updateSync("user", () => latest);
    }).toThrow(errorClass);
  });

  it("can still be replaced by an explicit set", async () => {
    const { storage, adapter } = make();

    await storage.set("user", latest);

    expect(JSON.parse(adapter.entries.get("user") as string)).toEqual({ v: 3, d: latest });
  });

  it("can still be removed explicitly", async () => {
    const { storage, adapter } = make();

    await storage.remove("user");

    expect(adapter.entries.has("user")).toBe(false);
  });

  it("still counts as stored", async () => {
    expect(await make().storage.has("user")).toBe(true);
  });
});

function reading(up: (previous: never) => unknown, schema: StandardSchemaV1 = v2) {
  const errors: Array<PlatformStorageError> = [];
  const key = {
    schema,
    versions: [{ schema: v1 }, { schema, up }],
  };
  const storage = createStorage({
    schema: defineStorageSchema({ user: key }),
    adapter: memoryAdapter({ initial: { user: JSON.stringify({ id: "1" }) } }),
    onError: (error) => {
      errors.push(error);
    },
  });

  return { storage, errors };
}

describe("a failing step", () => {
  it("names the step and keeps what it threw", async () => {
    const cause = new Error("boom");
    const { storage, errors } = reading(() => {
      throw cause;
    });

    await storage.get("user");

    expect(errors[0]).toMatchObject({
      code: STORAGE_ERROR_CODE.Migration,
      fromVersion: 1,
      toVersion: 2,
      cause,
      raw: { id: "1" },
    });
  });

  it("fails on a result the next version rejects", async () => {
    const { storage, errors } = reading(() => ({ id: "1" }));

    expect(await storage.get("user")).toBeUndefined();
    expect(errors[0]).toMatchObject({ code: STORAGE_ERROR_CODE.Migration });
    expect((errors[0] as StorageMigrationError).issues.length).toBeGreaterThan(0);
  });

  it("fails on a promise rather than storing one", async () => {
    const { storage, errors } = reading(() => Promise.resolve({ id: "1", email: "e" }));

    expect(await storage.get("user")).toBeUndefined();
    expect(errors[0]).toMatchObject({ code: STORAGE_ERROR_CODE.Migration });
    expect(errors[0]?.message).toContain("promise");
  });

  it("hands a step its own copy, so it cannot change a shared default", async () => {
    const shared = { id: "1" };
    const sharing: StandardSchemaV1<{ id: string }> = {
      "~standard": { version: 1, vendor: "test", validate: () => ({ value: shared }) },
    };
    const key = defineVersions(sharing).next(v2, (previous) => {
      previous.id = "changed";

      return { ...previous, email: "e" };
    });
    const storage = createStorage({
      schema: defineStorageSchema({ user: key }),
      adapter: memoryAdapter({ initial: { user: "{}" } }),
    });

    await storage.get("user");

    expect(shared.id).toBe("1");
  });
});

describe("a read of a versioned key's stored text that cannot be parsed", () => {
  it("is invalid before any step runs", async () => {
    const up = vi.fn(() => latest);
    const errors: Array<PlatformStorageError> = [];
    const storage = createStorage({
      schema: defineStorageSchema({ user: defineVersions(v2).next(v3, up) }),
      adapter: memoryAdapter({ initial: { user: "not json" } }),
      onError: (error) => {
        errors.push(error);
      },
    });

    expect(await storage.get("user")).toBeUndefined();
    expect(up).not.toHaveBeenCalled();
    expect(errors[0]?.code).toBe(STORAGE_ERROR_CODE.Serialization);
  });
});

describe("updating a versioned key", () => {
  it("hands the updater the migrated value and stores the latest version", async () => {
    const { storage, held } = harness({ id: "1" });

    await storage.update("user", (current) => ({ ...(current as typeof latest), name: "Z" }));

    expect(JSON.parse(held() as string)).toEqual({ v: 3, d: { ...latest, name: "Z" } });
  });
});

describe("watching a versioned key", () => {
  it("delivers a change as a read would see it, from any stored version", async () => {
    const { storage } = harness({ id: "1" });
    const changes: Array<unknown> = [];

    storage.watch("user", (change) => {
      changes.push(change.newValue);
    });
    await storage.set("user", { ...latest, name: "New" });

    expect(changes).toEqual([{ ...latest, name: "New" }]);
  });

  it("answers with the fallback for data newer than the code, and tells onError", async () => {
    const errors: Array<PlatformStorageError> = [];
    const adapter = feedAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ user: chain.options({ default: latest }) }),
      adapter,
      onError: (error) => {
        errors.push(error);
      },
    });
    const changes: Array<unknown> = [];

    storage.watch("user", (change) => {
      changes.push(change.newValue);
    });
    adapter.emit({
      key: "user",
      oldValue: JSON.stringify({ v: 3, d: latest }),
      newValue: JSON.stringify({ v: 9, d: { future: true } }),
    });

    await vi.waitFor(() => {
      expect(changes).toEqual([latest]);
    });
    expect(errors[0]).toBeInstanceOf(UnknownStorageVersionError);
    expect(adapter.calls.filter((call) => !call.startsWith("get"))).toEqual([]);
  });

  it("migrates a change arriving from a context still writing an older version", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });
    const changes: Array<unknown> = [];

    storage.watch("user", (change) => {
      changes.push(change.newValue);
    });
    adapter.emit({ key: "user", oldValue: undefined, newValue: JSON.stringify({ id: "1" }) });

    await vi.waitFor(() => {
      expect(changes).toEqual([latest]);
    });
    expect(adapter.calls.filter((call) => !call.startsWith("get"))).toEqual([]);
  });
});
