import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineKey,
  defineStorageSchema,
  memoryAdapter,
  StorageSchemaError,
  StorageSerializationError,
  StorageValidationError,
} from "../../index";
import type { InvalidContext, OnInvalid } from "../../index";
import { themeSchema } from "../../../tests/fixtures/schemas";

/** A stored value the schema rejects. */
const STORED_JUNK = { theme: '"purple"' };

function buildStorage(
  storagePolicy?: OnInvalid<unknown>,
  keyPolicy?: OnInvalid<unknown>,
  initial: Record<string, string> = STORED_JUNK,
) {
  const adapter = memoryAdapter({ initial });
  const schema = defineStorageSchema({
    theme: { schema: themeSchema, default: "light", onInvalid: keyPolicy },
  });

  return {
    adapter,
    storage: createStorage(
      storagePolicy === undefined
        ? { schema, adapter }
        : { schema, adapter, onInvalid: storagePolicy },
    ),
  };
}

describe("the built-in policy", () => {
  it("falls back rather than throwing, so stale data does not break a read", async () => {
    const { storage } = buildStorage();

    expect(await storage.get("theme")).toBe("light");
  });

  it("leaves the stored value in place, so a later migration can still see it", async () => {
    const { adapter, storage } = buildStorage();

    await storage.get("theme");

    expect(adapter.entries.get("theme")).toBe('"purple"');
  });

  it("returns undefined when the key has nothing to fall back on", async () => {
    const adapter = memoryAdapter({ initial: STORED_JUNK });
    const schema = defineStorageSchema({ theme: { schema: themeSchema } });

    expect(await createStorage({ schema, adapter }).get("theme")).toBeUndefined();
  });
});

describe("each policy", () => {
  it("throws, carrying what failed and why", async () => {
    const { storage } = buildStorage("throw");

    await storage.get("theme").catch((error: StorageValidationError) => {
      expect(error).toBeInstanceOf(StorageValidationError);
      expect(error.operation).toBe("get");
      expect(error.raw).toBe("purple");
      expect(error.issues.length).toBeGreaterThan(0);
      expect(error.physicalKey).toBe("theme");
    });

    expect.assertions(5);
  });

  it("falls back to the declared default", async () => {
    const { storage } = buildStorage("fallback");

    expect(await storage.get("theme")).toBe("light");
  });

  it("removes the stored value, then falls back", async () => {
    const { adapter, storage } = buildStorage("remove");

    expect(await storage.get("theme")).toBe("light");
    expect(adapter.entries.has("theme")).toBe(false);
  });

  it("hands a callback everything about the failure, and returns what it gives back", async () => {
    const seen: Array<InvalidContext> = [];
    const { storage } = buildStorage((context) => {
      seen.push(context);
      return "dark";
    });

    expect(await storage.get("theme")).toBe("dark");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.key).toBe("theme");
    expect(seen[0]?.physicalKey).toBe("theme");
    expect(seen[0]?.raw).toBe("purple");
    expect(seen[0]?.error).toBeInstanceOf(StorageValidationError);
    expect(seen[0]?.issues.length).toBeGreaterThan(0);
  });
});

describe("which policy wins", () => {
  it("prefers the key's policy over the storage's", async () => {
    const { adapter, storage } = buildStorage("fallback", "remove");

    await storage.get("theme");

    expect(adapter.entries.has("theme")).toBe(false);
  });

  it("prefers the call's policy over the key's", async () => {
    const { storage } = buildStorage(undefined, "fallback");

    await expect(storage.get("theme", { onInvalid: "throw" })).rejects.toThrow(
      StorageValidationError,
    );
  });

  it("prefers the call's policy over the storage's", async () => {
    const { storage } = buildStorage("throw");

    expect(await storage.get("theme", { onInvalid: "fallback" })).toBe("light");
  });

  it("uses the storage's policy where neither the key nor the call declares one", async () => {
    const { storage } = buildStorage("throw");

    await expect(storage.get("theme")).rejects.toThrow(StorageValidationError);
  });

  it("uses the built-in policy where nothing declares one", async () => {
    const { storage } = buildStorage();

    expect(await storage.get("theme")).toBe("light");
  });

  it("takes a callback declared on the key through defineKey, where it is checked", async () => {
    const adapter = memoryAdapter({ initial: STORED_JUNK });
    const schema = defineStorageSchema({
      theme: defineKey(themeSchema, {
        default: "light",
        onInvalid: (context) => (context.raw === "purple" ? "dark" : "light"),
      }),
    });

    expect(await createStorage({ schema, adapter }).get("theme")).toBe("dark");
  });
});

describe("data that is not even readable", () => {
  it("treats text that is not JSON as invalid, under the same policy", async () => {
    const { storage } = buildStorage(undefined, undefined, { theme: "{not json" });

    expect(await storage.get("theme")).toBe("light");
  });

  it("reports it as a serialization failure, naming the direction", async () => {
    const { storage } = buildStorage("throw", undefined, { theme: "{not json" });

    await storage.get("theme").catch((error: StorageSerializationError) => {
      expect(error).toBeInstanceOf(StorageSerializationError);
      expect(error.direction).toBe("deserialize");
      expect(error.raw).toBe("{not json");
    });

    expect.assertions(3);
  });

  it("gives a callback a readable reason even though no schema ran", async () => {
    const seen: Array<InvalidContext> = [];
    const { storage } = buildStorage(
      (context) => {
        seen.push(context);
        return "dark";
      },
      undefined,
      { theme: "{not json" },
    );

    expect(await storage.get("theme")).toBe("dark");
    expect(seen[0]?.issues).toHaveLength(1);
    expect(seen[0]?.issues[0]?.message).toContain("theme");
  });

  it("removes unreadable data under the remove policy", async () => {
    const { adapter, storage } = buildStorage("remove", undefined, { theme: "{not json" });

    await storage.get("theme");

    expect(adapter.entries.has("theme")).toBe(false);
  });
});

describe("the error observer", () => {
  it("sees a failure the policy went on to handle", async () => {
    const onError = vi.fn();
    const adapter = memoryAdapter({ initial: STORED_JUNK });
    const schema = defineStorageSchema({ theme: { schema: themeSchema, default: "light" } });

    await createStorage({ schema, adapter, onError, onInvalid: "fallback" }).get("theme");

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("sees it once, not once per layer that considered it", async () => {
    const onError = vi.fn();
    const adapter = memoryAdapter({ initial: STORED_JUNK });
    const schema = defineStorageSchema({
      theme: { schema: themeSchema, default: "light", onInvalid: "remove" },
    });

    await createStorage({ schema, adapter, onError, onInvalid: "throw" }).get("theme", {
      onInvalid: "fallback",
    });

    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("a policy that does not exist", () => {
  it("refuses it rather than silently doing nothing", async () => {
    const { storage } = buildStorage();

    await expect(storage.get("theme", { onInvalid: "reset" as never })).rejects.toThrow(
      StorageSchemaError,
    );
  });

  it("says which policies there are", async () => {
    const { storage } = buildStorage();

    await storage
      .get("theme", { onInvalid: "reset" as never })
      .catch((error: StorageSchemaError) => {
        expect(error.message).toContain('"reset"');
        expect(error.message).toContain('"throw"');
        expect(error.message).toContain('"fallback"');
        expect(error.message).toContain('"remove"');
      });

    expect.assertions(4);
  });
});
