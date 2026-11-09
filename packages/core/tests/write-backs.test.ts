import * as z from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createStorage,
  defineKey,
  defineStorageSchema,
  defineVersions,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  StorageValidationError,
  UnknownStorageVersionError,
} from "../src/index";
import type { PlatformStorageError, StandardSchemaV1, StorageAdapter } from "../src/index";
import { feedAdapter, gate, recordingAdapter } from "./fakes/adapters";

const v1 = z.object({ id: z.string() });
const v2 = z.object({ id: z.string(), email: z.string() });

const latest = { id: "1", email: "e@x" };
const chain = defineVersions(v1).next(v2, (previous) => ({ ...previous, email: "e@x" }));
const prefsSchema = z.object({ compact: z.boolean() });

const stored = (value: unknown): string => JSON.stringify(value);
const parsed = (wire: string | undefined): unknown => JSON.parse(wire as string);

function collecting(): {
  readonly errors: Array<PlatformStorageError>;
  readonly onError: (error: PlatformStorageError) => void;
} {
  const errors: Array<PlatformStorageError> = [];

  return {
    errors,
    onError: (error) => {
      errors.push(error);
    },
  };
}

/** A memory backend whose writes can be refused. */
function refusing(initial: Readonly<Record<string, string>>) {
  const memory = memoryAdapter({ initial });
  const control = { refuse: true, writes: 0 };

  return {
    control,
    memory,
    entries: memory.entries,
    adapter: {
      ...memory,
      setSync: (key: string, value: string) => {
        control.writes += 1;

        if (control.refuse) throw new Error("full");

        memory.setSync(key, value);
      },
    },
  };
}

function asyncRefusing(initial: Readonly<Record<string, string>>) {
  const recording = recordingAdapter(initial);
  const set = vi.fn(() => Promise.reject(new Error("full")));
  const adapter: StorageAdapter<string> = { ...recording, set };

  return { adapter, set };
}

describe("a migration's write-back", () => {
  it("saves the latest version, so the chain does not run again", async () => {
    const up = vi.fn((previous: { id: string }) => ({ ...previous, email: "e@x" }));
    const adapter = memoryAdapter({ initial: { user: stored({ id: "1" }) } });
    const storage = createStorage({
      schema: defineStorageSchema({ user: defineVersions(v1).next(v2, up) }),
      adapter,
    });

    expect(await storage.get("user")).toEqual(latest);
    expect(await storage.get("user")).toEqual(latest);
    expect(parsed(adapter.entries.get("user"))).toEqual({ v: 2, d: latest });
    expect(up).toHaveBeenCalledOnce();
  });

  it("saves on a synchronous read", () => {
    const adapter = memoryAdapter({ initial: { user: stored({ id: "1" }) } });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    expect(storage.getSync("user")).toEqual(latest);
    expect(parsed(adapter.entries.get("user"))).toEqual({ v: 2, d: latest });
  });

  it("saves over a backend that only answers later", async () => {
    const adapter = recordingAdapter({ user: stored({ v: 1, d: { id: "1" } }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    await storage.get("user");

    expect(parsed(adapter.entries.get("user"))).toEqual({ v: 2, d: latest });
  });

  it("writes nothing for a value already at the latest version", async () => {
    const adapter = recordingAdapter({ user: stored({ v: 2, d: latest }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    await storage.get("user");

    expect(adapter.calls).toEqual(["get user"]);
  });

  it("leaves a bare value bare under a chain of one version", async () => {
    const adapter = recordingAdapter({ user: stored({ id: "1" }) });
    const storage = createStorage({
      schema: defineStorageSchema({ user: defineVersions(v1) }),
      adapter,
    });

    await storage.get("user");

    expect(adapter.calls).toEqual(["get user"]);
  });

  it("never overwrites a write that landed after the read", async () => {
    const paused = gate();
    let first = true;
    const adapter = recordingAdapter({ user: stored({ id: "1" }) }, (call) => {
      if (call !== "get user" || !first) return undefined;

      first = false;

      return paused.opened;
    });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    const reading = storage.get("user");

    await vi.waitFor(() => {
      expect(adapter.calls).toContain("get user");
    });
    await storage.set("user", { id: "2", email: "new" });
    paused.open();

    expect(await reading).toEqual(latest);
    expect(parsed(adapter.entries.get("user"))).toEqual({
      v: 2,
      d: { id: "2", email: "new" },
    });
  });

  it("is dropped by an update, whose own write replaces the value", async () => {
    const adapter = recordingAdapter({ user: stored({ id: "1" }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    await storage.update("user", (current) => ({ ...(current as typeof latest), email: "u" }));

    expect(adapter.calls.filter((call) => call.startsWith("set"))).toEqual(["set user"]);
    expect(parsed(adapter.entries.get("user"))).toEqual({
      v: 2,
      d: { id: "1", email: "u" },
    });
  });
});

describe("a write-back that fails", () => {
  it("still returns the migrated value and reports once", () => {
    const { errors, onError } = collecting();
    const { adapter, entries } = refusing({ user: stored({ id: "1" }) });
    const storage = createStorage({
      schema: defineStorageSchema({ user: chain }),
      adapter,
      onError,
    });

    expect(storage.getSync("user")).toEqual(latest);
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Adapter]);
    expect(parsed(entries.get("user"))).toEqual({ id: "1" });
  });

  it("still returns the value when a backend rejects later", async () => {
    const { errors, onError } = collecting();
    const storage = createStorage({
      schema: defineStorageSchema({ user: chain }),
      adapter: asyncRefusing({ user: stored({ id: "1" }) }).adapter,
      onError,
    });

    expect(await storage.get("user")).toEqual(latest);
    expect(errors).toHaveLength(1);
  });

  it("is not tried again over a backend that answers later", async () => {
    const { adapter, set } = asyncRefusing({ user: stored({ id: "1" }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    await storage.get("user");
    await storage.get("user");

    expect(set).toHaveBeenCalledOnce();
  });

  it("is not tried again while the stored data is unchanged", () => {
    const { errors, onError } = collecting();
    const { adapter, control } = refusing({ user: stored({ id: "1" }) });
    const storage = createStorage({
      schema: defineStorageSchema({ user: chain }),
      adapter,
      onError,
    });

    expect(storage.getSync("user")).toEqual(latest);
    expect(storage.getSync("user")).toEqual(latest);
    expect(storage.getSync("user")).toEqual(latest);

    expect(control.writes).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it("is tried again once the stored data changes", () => {
    const { adapter, control, entries, memory } = refusing({ user: stored({ id: "1" }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: chain }), adapter });

    storage.getSync("user");
    control.refuse = false;
    memory.setSync("user", stored({ id: "2" }));
    storage.getSync("user");

    expect(parsed(entries.get("user"))).toEqual({ v: 2, d: { id: "2", email: "e@x" } });
  });
});

describe("a write-back that would not read back", () => {
  it("is skipped where the schema rejects its own output, keeping the original", async () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { old: '"5"' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        count: defineVersions(z.string())
          .next(z.string().transform(Number), (previous) => previous as unknown as number)
          .options({ readFrom: ["old"] }),
      }),
      adapter,
      onError,
    });

    expect(await storage.get("count")).toBe(5);
    expect(adapter.entries.get("old")).toBe('"5"');
    expect(adapter.entries.has("count")).toBe(false);
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Serialization]);
    expect(errors[0]?.cause).toMatchObject({ code: STORAGE_ERROR_CODE.Validation });
  });

  it("reports once, however often the value is read", () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { count: '"5"' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        count: defineVersions(z.string()).next(
          z.string().transform(Number),
          (previous) => previous as unknown as number,
        ),
      }),
      adapter,
      onError,
    });

    storage.getSync("count");
    storage.getSync("count");

    expect(errors).toHaveLength(1);
  });

  it("is skipped where the value cannot be serialized", () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { n: "1" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        n: defineVersions(z.number()).next(z.bigint(), (previous) => BigInt(previous)),
      }),
      adapter,
      onError,
    });

    expect(storage.getSync("n")).toBe(1n);
    expect(adapter.entries.get("n")).toBe("1");
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Serialization]);
  });

  it("is skipped where a step's result has no stored form", () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { nick: '"a"' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        nick: defineVersions(z.string()).next(z.string().optional(), () => undefined),
      }),
      adapter,
      onError,
    });

    expect(storage.getSync("nick")).toBeUndefined();
    expect(adapter.entries.get("nick")).toBe('"a"');
    expect(errors[0]?.code).toBe(STORAGE_ERROR_CODE.Serialization);
    expect(errors[0]?.cause).toBeUndefined();
  });

  it("is skipped where it would read back as still behind", () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { nick: '"a"' } });
    const anything = z.unknown();
    const storage = createStorage({
      schema: defineStorageSchema({
        nick: defineVersions(anything).next(z.unknown(), () => ({ toJSON: () => undefined })),
      }),
      adapter,
      onError,
    });

    storage.getSync("nick");

    expect(adapter.entries.get("nick")).toBe('"a"');
    expect(errors[0]?.code).toBe(STORAGE_ERROR_CODE.Serialization);
    expect(errors[0]?.cause).toBeUndefined();
  });

  it("is skipped where a repair has no stored form at all", () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { nick: "7" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        nick: {
          schema: z.string().transform(() => undefined),
          recover: () => "x" as never,
        },
      }),
      adapter,
      onError,
    });

    expect(storage.getSync("nick")).toBeUndefined();
    expect(adapter.entries.get("nick")).toBe("7");
    expect(errors[0]?.code).toBe(STORAGE_ERROR_CODE.Serialization);
  });
});

describe("preparing a write-back", () => {
  /* Turns "input" into something it then refuses, the shape of a schema that rejects its own output. */
  const selfRejecting: StandardSchemaV1<string, string> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => {
        if (value === "output") return { issues: [{ message: "refused" }] };

        return { value: value === "input" ? "output" : (value as string) };
      },
    },
  };
  const key = defineVersions(z.string()).next(selfRejecting, () => "input");

  it("does no work for an update, whose own write replaces the value", async () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { note: '"old"' } });
    const storage = createStorage({
      schema: defineStorageSchema({ note: key }),
      adapter,
      onError,
    });

    await storage.update("note", () => "fresh");

    expect(errors).toEqual([]);
    expect(parsed(adapter.entries.get("note"))).toEqual({ v: 2, d: "fresh" });
  });

  it("still returns the value when onError itself throws", async () => {
    const storage = createStorage({
      schema: defineStorageSchema({ note: key }),
      adapter: memoryAdapter({ initial: { note: '"old"' } }),
      onError: () => {
        throw new Error("observer");
      },
    });

    expect(await storage.get("note")).toBe("output");
  });
});

/** Accepts numbers, and holds the candidate's validation open on the second sighting of `1`: once as the step's result, then as the read-back. */
function pausingOnReadBack(): {
  readonly schema: StandardSchemaV1<number, number>;
  readonly reached: Promise<void>;
  open(): void;
} {
  const paused = gate();
  const arrived = gate();
  let sightings = 0;

  return {
    reached: arrived.opened,
    open: paused.open,
    schema: {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          if (value === 1) sightings += 1;
          if (sightings !== 2 || value !== 1) return { value: value as number };

          arrived.open();

          return paused.opened.then(() => ({ value: 1 }));
        },
      },
    },
  };
}

describe("a synchronous write landing while a write-back is prepared", () => {
  it("is not overwritten by the write-back", async () => {
    const { schema, reached, open } = pausingOnReadBack();
    const adapter = memoryAdapter({ initial: { count: "0" } });
    const storage = createStorage({
      schema: defineStorageSchema({ count: defineVersions(z.number()).next(schema, () => 1) }),
      adapter,
    });

    const reading = storage.get("count");

    await reached;
    storage.setSync("count", 9);
    open();

    expect(await reading).toBe(1);
    expect(parsed(adapter.entries.get("count"))).toEqual({ v: 2, d: 9 });
  });

  it("is not overwritten when the value was found under an old name", async () => {
    const { schema, reached, open } = pausingOnReadBack();
    const adapter = memoryAdapter({ initial: { old: "0" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        count: defineVersions(z.number())
          .next(schema, () => 1)
          .options({ readFrom: ["old"] }),
      }),
      adapter,
    });

    const reading = storage.get("count");

    await reached;
    storage.setSync("count", 9);
    open();
    await reading;

    expect(parsed(adapter.entries.get("count"))).toEqual({ v: 2, d: 9 });
  });
});

describe("a write-back that would read back as a different value", () => {
  const exclaiming = defineVersions(z.string()).next(
    z.string().transform((value) => `${value}!`),
    (previous) => previous,
  );

  it("keeps the original, so every read answers the same", () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { note: '"a"' } });
    const storage = createStorage({
      schema: defineStorageSchema({ note: exclaiming }),
      adapter,
      onError,
    });

    expect(storage.getSync("note")).toBe("a!");
    expect(storage.getSync("note")).toBe("a!");
    expect(adapter.entries.get("note")).toBe('"a"');
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Serialization]);
  });

  it("keeps the original when recover's repair is what would change", () => {
    const adapter = memoryAdapter({ initial: { note: "7" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        note: {
          schema: z.string().transform((value) => `${value}!`),
          recover: () => "a" as never,
        },
      }),
      adapter,
    });

    expect(storage.getSync("note")).toBe("a!");
    expect(adapter.entries.get("note")).toBe("7");
  });
});

/** Runs something and answers with every rejection nothing handled, waiting long enough for one to surface. */
async function unhandledDuring(run: () => Promise<unknown>): Promise<ReadonlyArray<unknown>> {
  const seen: Array<unknown> = [];
  const record = (reason: unknown): void => {
    seen.push(reason);
  };

  process.on("unhandledRejection", record);
  await run();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  process.off("unhandledRejection", record);

  return seen;
}

const rejecting = (): Promise<never> => Promise.reject(new Error("callback failed"));

describe("a callback that returns a rejected promise", () => {
  it("fails a step without leaving the rejection unhandled", async () => {
    const { errors, onError } = collecting();
    const storage = createStorage({
      schema: defineStorageSchema({
        user: { schema: v2, versions: [{ schema: v1 }, { schema: v2, up: rejecting }] },
      }),
      adapter: memoryAdapter({ initial: { user: stored({ id: "1" }) } }),
      onError,
    });

    expect(await unhandledDuring(() => storage.get("user"))).toEqual([]);
    expect(errors[0]?.code).toBe(STORAGE_ERROR_CODE.Migration);
  });

  it("fails recover without leaving the rejection unhandled", async () => {
    const { errors, onError } = collecting();
    const storage = createStorage({
      schema: defineStorageSchema({
        user: { schema: v1, recover: rejecting as unknown as () => undefined },
      }),
      adapter: memoryAdapter({ initial: { user: stored(7) } }),
      onError,
    });

    expect(await unhandledDuring(() => storage.get("user"))).toEqual([]);
    expect(errors[0]?.message).toContain("promise");
  });
});

describe("a write-back whose stored form loses what the value held", () => {
  const amounts = z
    .union([z.map(z.string(), z.number()), z.record(z.string(), z.number())])
    .transform((value) => (value instanceof Map ? value : new Map(Object.entries(value))));

  it("keeps the original rather than saving a map as an empty object", async () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { value: "7" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        value: defineVersions(z.number()).next(
          amounts,
          (previous) => new Map([["amount", previous]]),
        ),
      }),
      adapter,
      onError,
    });

    expect(await storage.get("value")).toEqual(new Map([["amount", 7]]));
    expect(await storage.get("value")).toEqual(new Map([["amount", 7]]));
    expect(adapter.entries.get("value")).toBe("7");
    expect(errors[0]?.code).toBe(STORAGE_ERROR_CODE.Serialization);
  });

  it("keeps the original rather than saving an element that would read back as a hole", async () => {
    const withHoles = z.array(z.union([z.nan(), z.null()])).transform((values) => {
      // oxlint-disable-next-line typescript/no-array-delete
      if (values[0] === null) delete values[0];

      return values;
    });
    const adapter = memoryAdapter({ initial: { value: "0" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        value: defineVersions(z.number()).next(withHoles, () => [Number.NaN]),
      }),
      adapter,
    });

    expect(await storage.get("value")).toEqual([Number.NaN]);
    expect(0 in ((await storage.get("value")) as Array<unknown>)).toBe(true);
    expect(adapter.entries.get("value")).toBe("0");
  });

  it("keeps the original rather than saving a date as the text it would read back as", () => {
    const adapter = memoryAdapter({ initial: { at: '"2026-01-01T00:00:00.000Z"' } });
    const storage = createStorage({
      schema: defineStorageSchema({
        at: defineVersions(z.string()).next(
          z.union([z.date(), z.string()]),
          (previous) => new Date(previous),
        ),
      }),
      adapter,
    });

    expect(storage.getSync("at")).toBeInstanceOf(Date);
    expect(storage.getSync("at")).toBeInstanceOf(Date);
    expect(adapter.entries.get("at")).toBe('"2026-01-01T00:00:00.000Z"');
  });
});

const writeNothing = (): void => undefined;

describe("a synchronous write made from inside the read that repairs", () => {
  it("is not overwritten when recover makes it", () => {
    const adapter = memoryAdapter({ initial: { value: '"broken"' } });
    let writeFresh = writeNothing;
    const storage = createStorage({
      schema: defineStorageSchema({
        value: {
          schema: z.number(),
          recover: () => {
            writeFresh();

            return 1;
          },
        },
      }),
      adapter,
    });

    writeFresh = () => {
      storage.setSync("value", 9);
    };

    expect(storage.getSync("value")).toBe(1);
    expect(adapter.entries.get("value")).toBe("9");
  });

  it("is not overwritten when a step makes it", () => {
    const adapter = memoryAdapter({ initial: { value: "0" } });
    let writeFresh = writeNothing;
    const storage = createStorage({
      schema: defineStorageSchema({
        value: defineVersions(z.number()).next(z.number(), (previous) => {
          writeFresh();

          return previous + 1;
        }),
      }),
      adapter,
    });

    writeFresh = () => {
      writeFresh = writeNothing;
      storage.setSync("value", 9);
    };

    expect(storage.getSync("value")).toBe(1);
    expect(parsed(adapter.entries.get("value"))).toEqual({ v: 2, d: 9 });
  });

  it("is not overwritten when the read-back's validator makes it", () => {
    const adapter = memoryAdapter({ initial: { value: "0" } });
    let sightings = 0;
    let writeFresh = writeNothing;
    const counting: StandardSchemaV1<number, number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          if (value === 1) sightings += 1;
          if (sightings === 2 && value === 1) writeFresh();

          return { value: value as number };
        },
      },
    };
    const storage = createStorage({
      schema: defineStorageSchema({ value: defineVersions(z.number()).next(counting, () => 1) }),
      adapter,
    });

    writeFresh = () => {
      storage.setSync("value", 9);
    };

    expect(storage.getSync("value")).toBe(1);
    expect(parsed(adapter.entries.get("value"))).toEqual({ v: 2, d: 9 });
  });

  it("is not overwritten when the value was found under an old name", () => {
    const adapter = memoryAdapter({ initial: { old: '"broken"' } });
    let writeFresh = writeNothing;
    const storage = createStorage({
      schema: defineStorageSchema({
        value: {
          schema: z.number(),
          readFrom: ["old"],
          recover: () => {
            writeFresh();

            return 1;
          },
        },
      }),
      adapter,
    });

    writeFresh = () => {
      storage.setSync("value", 9);
    };

    expect(storage.getSync("value")).toBe(1);
    expect(adapter.entries.get("value")).toBe("9");
  });
});

describe("a versioned key found under an old name", () => {
  const renamed = chain.options({ key: "app:user", readFrom: ["user"] });

  it("runs the chain and writes the result under the current name", async () => {
    const adapter = memoryAdapter({ initial: { user: stored({ id: "1" }) } });
    const storage = createStorage({ schema: defineStorageSchema({ user: renamed }), adapter });

    expect(await storage.get("user")).toEqual(latest);
    expect(parsed(adapter.entries.get("app:user"))).toEqual({ v: 2, d: latest });
    expect(adapter.entries.has("user")).toBe(false);
  });

  it("copies an envelope already at the latest version", async () => {
    const adapter = memoryAdapter({ initial: { user: stored({ v: 2, d: latest }) } });
    const storage = createStorage({ schema: defineStorageSchema({ user: renamed }), adapter });

    await storage.get("user");

    expect(parsed(adapter.entries.get("app:user"))).toEqual({ v: 2, d: latest });
    expect(adapter.entries.has("user")).toBe(false);
  });

  it("does not disturb data newer than the code", async () => {
    const adapter = memoryAdapter({ initial: { user: stored({ v: 9, d: "future" }) } });
    const { errors, onError } = collecting();
    const storage = createStorage({
      schema: defineStorageSchema({ user: renamed }),
      adapter,
      onError,
      onInvalid: "remove",
    });

    expect(await storage.get("user")).toBeUndefined();
    expect(parsed(adapter.entries.get("user"))).toEqual({ v: 9, d: "future" });
    expect(adapter.entries.has("app:user")).toBe(false);
    expect(errors[0]).toBeInstanceOf(UnknownStorageVersionError);
  });

  it("leaves the old name in place when the write-back fails", () => {
    const { adapter, entries } = refusing({ user: stored({ id: "1" }) });
    const storage = createStorage({ schema: defineStorageSchema({ user: renamed }), adapter });

    expect(storage.getSync("user")).toEqual(latest);
    expect(entries.has("user")).toBe(true);
  });

  it("does not overwrite a value written under the current name since the read", async () => {
    const paused = gate();
    let first = true;
    const adapter = recordingAdapter({ user: stored({ id: "1" }) }, (call) => {
      if (call !== "get user" || !first) return undefined;

      first = false;

      return paused.opened;
    });
    const storage = createStorage({ schema: defineStorageSchema({ user: renamed }), adapter });

    const reading = storage.get("user");

    await vi.waitFor(() => {
      expect(adapter.calls).toContain("get user");
    });
    await storage.set("user", { id: "2", email: "new" });
    paused.open();
    await reading;

    expect(parsed(adapter.entries.get("app:user"))).toEqual({
      v: 2,
      d: { id: "2", email: "new" },
    });
  });
});

const repair = (raw: unknown): { compact: boolean } | undefined =>
  typeof raw === "object" && raw !== null && "dense" in raw
    ? { compact: raw.dense === true }
    : undefined;

describe("recover on an ordinary key", () => {
  const prefs = defineKey(prefsSchema, { recover: repair });

  it("answers with the repair and saves it bare", async () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { prefs: stored({ dense: true }) } });
    const storage = createStorage({ schema: defineStorageSchema({ prefs }), adapter, onError });

    expect(await storage.get("prefs")).toEqual({ compact: true });
    expect(parsed(adapter.entries.get("prefs"))).toEqual({ compact: true });
    expect(errors).toEqual([]);
  });

  it("works on a synchronous read", () => {
    const adapter = memoryAdapter({ initial: { prefs: stored({ dense: true }) } });
    const storage = createStorage({ schema: defineStorageSchema({ prefs }), adapter });

    expect(storage.getSync("prefs")).toEqual({ compact: true });
    expect(parsed(adapter.entries.get("prefs"))).toEqual({ compact: true });
  });

  it("does not run for a valid value or an empty key", async () => {
    const recover = vi.fn(() => undefined);
    const adapter = memoryAdapter({ initial: { prefs: stored({ compact: true }) } });
    const storage = createStorage({
      schema: defineStorageSchema({
        prefs: defineKey(prefsSchema, { recover }),
        other: defineKey(prefsSchema, { recover }),
      }),
      adapter,
    });

    await storage.get("prefs");
    await storage.get("other");

    expect(recover).not.toHaveBeenCalled();
  });

  it("receives text that could not be parsed, and can salvage it", async () => {
    const adapter = memoryAdapter({ initial: { theme: "dark" } });
    const storage = createStorage({
      schema: defineStorageSchema({
        theme: defineKey(z.enum(["light", "dark"]), {
          recover: (raw) => (raw === "dark" ? "dark" : undefined),
        }),
      }),
      adapter,
    });

    expect(await storage.get("theme")).toBe("dark");
    expect(adapter.entries.get("theme")).toBe('"dark"');
  });

  it("takes precedence over the invalid-data policy", async () => {
    const adapter = memoryAdapter({ initial: { prefs: stored({ dense: false }) } });
    const storage = createStorage({
      schema: defineStorageSchema({ prefs }),
      adapter,
      onInvalid: "throw",
    });

    expect(await storage.get("prefs", { onInvalid: "remove" })).toEqual({ compact: false });
    expect(adapter.entries.has("prefs")).toBe(true);
  });

  it("hands over to the policy when it answers undefined, reporting the original failure", async () => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { prefs: stored(7) } });
    const storage = createStorage({
      schema: defineStorageSchema({ prefs }),
      adapter,
      onError,
    });

    expect(await storage.get("prefs")).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(StorageValidationError);
    expect(parsed(adapter.entries.get("prefs"))).toBe(7);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("nope");
      },
      "`recover` threw",
    ],
    ["returns a promise", () => Promise.resolve({ compact: true }), "promise"],
    ["returns something invalid", () => ({ compact: "no" }), "compact"],
  ])("reports when it %s, then applies the policy", async (_label, recover, message) => {
    const { errors, onError } = collecting();
    const adapter = memoryAdapter({ initial: { prefs: stored(7) } });
    const storage = createStorage({
      schema: defineStorageSchema({
        prefs: { schema: prefsSchema, recover: recover as unknown as () => undefined },
      }),
      adapter,
      onError,
      onInvalid: "throw",
    });

    await expect(storage.get("prefs")).rejects.toBeInstanceOf(StorageValidationError);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain(message);
    expect(parsed(adapter.entries.get("prefs"))).toBe(7);
  });

  it("still answers when saving the repair fails", () => {
    const { errors, onError } = collecting();
    const { adapter } = refusing({ prefs: stored({ dense: true }) });
    const storage = createStorage({ schema: defineStorageSchema({ prefs }), adapter, onError });

    expect(storage.getSync("prefs")).toEqual({ compact: true });
    expect(errors.map((error) => error.code)).toEqual([STORAGE_ERROR_CODE.Adapter]);
  });

  it("never overwrites a write that landed after the read", async () => {
    const paused = gate();
    let first = true;
    const adapter = recordingAdapter({ prefs: stored({ dense: true }) }, (call) => {
      if (call !== "get prefs" || !first) return undefined;

      first = false;

      return paused.opened;
    });
    const storage = createStorage({ schema: defineStorageSchema({ prefs }), adapter });

    const reading = storage.get("prefs");

    await vi.waitFor(() => {
      expect(adapter.calls).toContain("get prefs");
    });
    await storage.set("prefs", { compact: false });
    paused.open();
    await reading;

    expect(parsed(adapter.entries.get("prefs"))).toEqual({ compact: false });
  });

  it("gives an update the repaired value", async () => {
    const adapter = memoryAdapter({ initial: { prefs: stored({ dense: true }) } });
    const storage = createStorage({ schema: defineStorageSchema({ prefs }), adapter });
    const updater = vi.fn((current: { compact: boolean } | undefined) => current as never);

    await storage.update("prefs", updater);

    expect(updater).toHaveBeenCalledWith({ compact: true });
  });

  it("answers a watcher without saving anything", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema: defineStorageSchema({ prefs }), adapter });
    const changes: Array<unknown> = [];

    storage.watch("prefs", (change) => {
      changes.push(change.newValue);
    });
    adapter.emit({ key: "prefs", oldValue: undefined, newValue: stored({ dense: true }) });

    await vi.waitFor(() => {
      expect(changes).toEqual([{ compact: true }]);
    });
    expect(adapter.calls.filter((call) => !call.startsWith("get"))).toEqual([]);
  });

  it("falls to a watcher's policy when it cannot repair", async () => {
    const { errors, onError } = collecting();
    const adapter = feedAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ prefs }),
      adapter,
      onError,
      onInvalid: () => ({ compact: false }),
    });
    const changes: Array<unknown> = [];

    storage.watch("prefs", (change) => {
      changes.push(change.newValue);
    });
    adapter.emit({ key: "prefs", oldValue: undefined, newValue: stored(7) });

    await vi.waitFor(() => {
      expect(changes).toEqual([{ compact: false }]);
    });
    expect(errors).toHaveLength(1);
  });

  it("removes only the old name it salvaged, leaving later ones unread", async () => {
    const adapter = memoryAdapter({
      initial: { a: stored({ dense: true }), b: stored({ compact: false }) },
    });
    const storage = createStorage({
      schema: defineStorageSchema({
        prefs: defineKey(prefsSchema, { key: "current", readFrom: ["a", "b"], recover: repair }),
      }),
      adapter,
    });

    expect(await storage.get("prefs")).toEqual({ compact: true });
    expect(parsed(adapter.entries.get("current"))).toEqual({ compact: true });
    expect(adapter.entries.has("a")).toBe(false);
    expect(adapter.entries.has("b")).toBe(true);
  });
});

function versioned(up: (previous: { id: string }) => { id: string; email: string }) {
  return defineVersions(v1)
    .next(v2, up)
    .options({
      recover: (raw) =>
        typeof raw === "object" && raw !== null && "legacyId" in raw
          ? { id: String(raw.legacyId), email: "r" }
          : undefined,
    });
}

const passThrough = (previous: { id: string }): { id: string; email: string } => ({
  ...previous,
  email: "e",
});

describe("recover on a versioned key", () => {
  it("runs after the chain, on what still fails, without its envelope", async () => {
    const adapter = memoryAdapter({ initial: { user: stored({ v: 1, d: { legacyId: 7 } }) } });
    const storage = createStorage({
      schema: defineStorageSchema({ user: versioned(passThrough) }),
      adapter,
    });

    expect(await storage.get("user")).toEqual({ id: "7", email: "r" });
    expect(parsed(adapter.entries.get("user"))).toEqual({
      v: 2,
      d: { id: "7", email: "r" },
    });
  });

  it("does not run when the chain succeeds", async () => {
    const recover = vi.fn(() => undefined);
    const adapter = memoryAdapter({ initial: { user: stored({ id: "1" }) } });
    const storage = createStorage({
      schema: defineStorageSchema({ user: chain.options({ recover }) }),
      adapter,
    });

    await storage.get("user");

    expect(recover).not.toHaveBeenCalled();
  });

  it("receives what was stored when a step fails, not what the step was given", async () => {
    const seen: Array<unknown> = [];
    const adapter = memoryAdapter({ initial: { user: stored({ id: "1", extra: true }) } });
    const key = defineVersions(v1)
      .next(v2, () => {
        throw new Error("boom");
      })
      .options({
        recover: (raw) => {
          seen.push(raw);

          return latest;
        },
      });
    const storage = createStorage({ schema: defineStorageSchema({ user: key }), adapter });

    expect(await storage.get("user")).toEqual(latest);
    expect(seen).toEqual([{ id: "1", extra: true }]);
  });

  it("lifts the protection a failed step gives, since the value has been repaired", async () => {
    const adapter = memoryAdapter({ initial: { user: stored({ id: "1" }) } });
    const key = defineVersions(v1)
      .next(v2, () => {
        throw new Error("boom");
      })
      .options({ recover: () => latest });
    const storage = createStorage({ schema: defineStorageSchema({ user: key }), adapter });

    await storage.update("user", () => ({ id: "u", email: "u" }));

    expect(parsed(adapter.entries.get("user"))).toEqual({
      v: 2,
      d: { id: "u", email: "u" },
    });
  });

  it("does not run on data newer than the code", async () => {
    const recover = vi.fn(() => latest);
    const adapter = memoryAdapter({ initial: { user: stored({ v: 9, d: "future" }) } });
    const storage = createStorage({
      schema: defineStorageSchema({ user: chain.options({ recover }) }),
      adapter,
    });

    await storage.get("user");

    expect(recover).not.toHaveBeenCalled();
    expect(parsed(adapter.entries.get("user"))).toEqual({ v: 9, d: "future" });
  });

  it("salvages unparseable text directly, skipping the chain", async () => {
    const up = vi.fn(passThrough);
    const adapter = memoryAdapter({ initial: { user: "plain" } });
    const key = defineVersions(v1)
      .next(v2, up)
      .options({ recover: (raw) => (raw === "plain" ? latest : undefined) });
    const storage = createStorage({ schema: defineStorageSchema({ user: key }), adapter });

    expect(await storage.get("user")).toEqual(latest);
    expect(up).not.toHaveBeenCalled();
    expect(parsed(adapter.entries.get("user"))).toEqual({ v: 2, d: latest });
  });
});
