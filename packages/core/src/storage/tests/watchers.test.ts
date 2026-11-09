import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import {
  createStorage,
  defineStorageSchema,
  memoryAdapter,
  STORAGE_ERROR_CODE,
  STORAGE_OPERATION,
  StorageUnavailableError,
} from "../../index";
import type { StandardSchemaV1, StorageAdapter } from "../../index";
import { feedAdapter, gate, recordingAdapter } from "../../../tests/fakes/adapters";
import { slowerWhenLongerSchema, themeSchema } from "../../../tests/fixtures/schemas";

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  stored: { schema: themeSchema, key: "app:stored", readFrom: ["old-stored"] },
  nickname: { schema: z.string().optional() },
});

describe("watch", () => {
  it("delivers a write with the value before and after it", async () => {
    const storage = createStorage({
      schema,
      adapter: recordingAdapter({ theme: '"dark"' }),
    });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await storage.set("theme", "light");

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      key: "theme",
      oldValue: "dark",
      newValue: "light",
      oldValueKnown: true,
    });
  });

  it("delivers before a synchronous write returns", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const listener = vi.fn();

    storage.watch("theme", listener);
    storage.setSync("theme", "dark");

    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ oldValue: "light", newValue: "dark" }),
    );
  });

  it("reads an empty key as its default on either side", async () => {
    const storage = createStorage({ schema, adapter: recordingAdapter({ theme: '"dark"' }) });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await storage.remove("theme");

    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ oldValue: "dark", newValue: "light" }),
    );
  });

  it("reports clear, update and a write of undefined", async () => {
    const storage = createStorage({
      schema,
      adapter: recordingAdapter({ nickname: '"x"', theme: '"dark"' }),
    });
    const nickname = vi.fn();
    const theme = vi.fn();

    storage.watch("nickname", nickname);
    storage.watch("theme", theme);

    await storage.set("nickname", undefined);
    await storage.update("theme", () => "light");
    await storage.clear();

    expect(nickname.mock.calls[0]?.[0]).toMatchObject({ oldValue: "x", newValue: undefined });
    expect(theme.mock.calls.map(([change]) => change.newValue)).toEqual(["light", "light"]);
  });

  it("finds what a key held under an old name", async () => {
    const storage = createStorage({
      schema,
      adapter: recordingAdapter({ "old-stored": '"dark"' }),
    });
    const listener = vi.fn();

    storage.watch("stored", listener);
    await storage.set("stored", "light");

    expect(listener.mock.calls[0]?.[0]).toMatchObject({ oldValue: "dark", newValue: "light" });
  });

  it("says nothing about a write that failed", async () => {
    const storage = createStorage({
      schema,
      adapter: { ...recordingAdapter(), set: () => Promise.reject(new Error("refused")) },
    });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await expect(storage.set("theme", "dark")).rejects.toThrow();

    expect(listener).not.toHaveBeenCalled();
  });

  it("still writes when what it replaces cannot be read, and says the old value is unknown", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({
      schema,
      adapter: { ...adapter, get: () => Promise.reject(new Error("refused")) },
    });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await storage.set("theme", "dark");

    expect(adapter.entries.get("theme")).toBe('"dark"');
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      oldValue: "light",
      newValue: "dark",
      oldValueKnown: false,
    });
  });

  it("copes with a synchronous failure reading what it replaces", () => {
    const adapter = {
      ...memoryAdapter(),
      getSync: () => {
        throw new Error("refused");
      },
    };
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();

    storage.watch("theme", listener);
    storage.setSync("theme", "dark");

    expect(listener.mock.calls[0]?.[0]).toMatchObject({ oldValueKnown: false });
  });

  it("stays silent about a move, because the key's value has not changed", async () => {
    const adapter = recordingAdapter({ "old-stored": '"dark"' });
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();
    const anyChange = vi.fn();

    storage.watch("stored", listener);
    storage.onChange(anyChange);
    await storage.get("stored");

    expect(adapter.entries.get("app:stored")).toBe('"dark"');
    expect(listener).not.toHaveBeenCalled();
    expect(anyChange).not.toHaveBeenCalled();
  });

  it("refuses a key the schema does not declare, naming it", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expect(() => storage.watch("nope" as never, vi.fn())).toThrow(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.UnknownKey }),
    );
  });

  it("stops when asked, and asking twice is harmless", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const listener = vi.fn();
    const stop = storage.watch("theme", listener);

    stop();
    stop();
    storage.setSync("theme", "dark");

    expect(listener).not.toHaveBeenCalled();
  });

  it("treats one function watching twice as two watchers", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const listener = vi.fn();
    const stopFirst = storage.watch("theme", listener);

    storage.watch("theme", listener);
    stopFirst();
    storage.setSync("theme", "dark");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps a key's other watchers when one stops", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const first = vi.fn();
    const second = vi.fn();
    const stop = storage.watch("theme", first);

    storage.watch("theme", second);
    stop();
    storage.setSync("theme", "dark");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("does not disturb a new watcher when an old stop arrives late", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const first = storage.watch("theme", vi.fn());

    first();

    const listener = vi.fn();

    storage.watch("theme", listener);
    first();
    storage.setSync("theme", "dark");

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("onChange", () => {
  it("names the key without reading anything", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();

    storage.onChange(listener);
    await storage.set("theme", "dark");

    expect(listener).toHaveBeenCalledExactlyOnceWith("theme");
    expect(adapter.calls).toEqual(["set theme"]);
  });

  it("stops when asked", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const listener = vi.fn();

    storage.onChange(listener)();
    storage.setSync("theme", "dark");

    expect(listener).not.toHaveBeenCalled();
  });

  it("does nothing extra for a write nobody is listening to", async () => {
    const adapter = recordingAdapter();
    const storage = createStorage({ schema, adapter });

    await storage.set("theme", "dark");

    expect(adapter.calls).toEqual(["set theme"]);
  });
});

describe("changes a backend reports", () => {
  it("maps a stored name back to its key and decodes both sides", () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();
    const anyChange = vi.fn();

    storage.watch("stored", listener);
    storage.onChange(anyChange);
    adapter.emit({ key: "app:stored", oldValue: '"light"', newValue: '"dark"' });

    expect(anyChange).toHaveBeenCalledExactlyOnceWith("stored");
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      key: "stored",
      oldValue: "light",
      newValue: "dark",
      oldValueKnown: true,
    });
  });

  it("ignores names the schema does not declare, and a key's old names", () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter });
    const anyChange = vi.fn();

    storage.onChange(anyChange);
    adapter.emit({ key: "someone-elses", oldValue: undefined, newValue: '"x"' });
    adapter.emit({ key: "old-stored", oldValue: undefined, newValue: '"dark"' });

    expect(anyChange).not.toHaveBeenCalled();
  });

  it("reports each write once where the backend echoes its own", async () => {
    const adapter = feedAdapter({}, true);
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await storage.set("theme", "dark");

    expect(listener).not.toHaveBeenCalled();
    expect(adapter.calls).toEqual(["set theme"]);

    adapter.emit({ key: "theme", oldValue: undefined, newValue: '"dark"' });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("announces its own writes where the backend does not echo them", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await storage.set("theme", "dark");

    expect(listener).toHaveBeenCalledOnce();
  });

  describe("when anything may have changed", () => {
    it("tells onChange no key, and has each watcher read its key again", async () => {
      const adapter = feedAdapter({ theme: '"dark"' });
      const storage = createStorage({ schema, adapter });
      const listener = vi.fn();
      const anyChange = vi.fn();

      storage.watch("theme", listener);
      storage.onChange(anyChange);
      adapter.emit({ key: undefined });

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledOnce();
      });

      expect(anyChange).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(listener).toHaveBeenCalledWith({
        key: "theme",
        oldValue: "light",
        newValue: "dark",
        oldValueKnown: false,
      });
    });

    it("reports a failed read once and delivers nothing", async () => {
      const adapter = feedAdapter();
      const onError = vi.fn();
      const storage = createStorage({
        schema,
        adapter: { ...adapter, get: () => Promise.reject(new Error("refused")) },
        onError,
      });
      const listener = vi.fn();

      storage.watch("theme", listener);
      adapter.emit({ key: undefined });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledOnce();
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ operation: STORAGE_OPERATION.Get }),
      );
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it("delivers the fallback for invalid data, reports it, and changes nothing stored", () => {
    const adapter = feedAdapter({ theme: '"mauve"' });
    const onError = vi.fn();
    const storage = createStorage({ schema, adapter, onInvalid: "remove", onError });
    const listener = vi.fn();

    storage.watch("theme", listener);
    adapter.emit({ key: "theme", oldValue: undefined, newValue: '"mauve"' });

    expect(listener.mock.calls[0]?.[0]).toMatchObject({ newValue: "light" });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: STORAGE_ERROR_CODE.Validation }),
    );
    expect(adapter.calls).toEqual([]);
    expect(adapter.entries.get("theme")).toBe('"mauve"');
  });
});

function polluteOldValue(change: { readonly oldValue: Array<string> }): void {
  change.oldValue.push("polluted");
}

describe("a key still held under an old name", () => {
  it("is what a change to no particular key reads", async () => {
    const adapter = feedAdapter({ "old-stored": '"dark"' });
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();

    storage.watch("stored", listener);
    adapter.emit({ key: undefined });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledOnce();
    });

    expect(listener.mock.calls[0]?.[0]).toMatchObject({ newValue: "dark" });
  });

  describe("over a backend that reports its own writes", () => {
    it("is announced when removed, because the backend names only the old name", async () => {
      const adapter = feedAdapter({ "old-stored": '"dark"' }, true);
      const storage = createStorage({ schema, adapter });
      const listener = vi.fn();

      storage.watch("stored", listener);
      await storage.remove("stored");

      expect(listener).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ oldValue: "dark", newValue: undefined }),
      );
    });

    it("leaves a value under the current name to the backend's own report", async () => {
      const adapter = feedAdapter({ "app:stored": '"dark"' }, true);
      const storage = createStorage({ schema, adapter });
      const listener = vi.fn();

      storage.watch("stored", listener);
      await storage.remove("stored");

      expect(listener).not.toHaveBeenCalled();
    });

    it("announces nothing when nothing was stored", async () => {
      const storage = createStorage({ schema, adapter: feedAdapter({}, true) });
      const listener = vi.fn();

      storage.watch("stored", listener);
      await storage.remove("stored");

      expect(listener).not.toHaveBeenCalled();
    });

    it("announces nothing when what was stored cannot be read", async () => {
      const adapter = feedAdapter({ "old-stored": '"dark"' }, true);
      const storage = createStorage({
        schema,
        adapter: { ...adapter, get: () => Promise.reject(new Error("refused")) },
      });
      const listener = vi.fn();

      storage.watch("stored", listener);
      await storage.remove("stored");

      expect(listener).not.toHaveBeenCalled();
    });

    it("spends nothing extra on a write, or where nobody is listening", async () => {
      const adapter = feedAdapter({}, true);
      const storage = createStorage({ schema, adapter });

      await storage.remove("stored");
      storage.watch("stored", vi.fn());
      await storage.set("stored", "dark");

      expect(adapter.calls).toEqual([
        "remove old-stored",
        "remove app:stored",
        "set app:stored",
        "remove old-stored",
      ]);
    });
  });
});

describe("what a listener is given", () => {
  const tags = defineStorageSchema({ tags: { schema: z.array(z.string()), default: [] } });

  it("is its own copy, so changing it reaches neither another listener nor the default", () => {
    const storage = createStorage({ schema: tags, adapter: memoryAdapter() });
    const second = vi.fn();

    storage.watch("tags", polluteOldValue);
    storage.watch("tags", second);
    storage.setSync("tags", ["a"]);
    storage.removeSync("tags");

    expect(second.mock.calls[0]?.[0]).toMatchObject({ oldValue: [] });
    expect(storage.getSync("tags")).toEqual([]);
  });

  it("is an onInvalid callback's answer, matching what a read says", async () => {
    const adapter = feedAdapter({ theme: '"mauve"' });
    const storage = createStorage({
      schema: defineStorageSchema({ theme: { schema: themeSchema } }),
      adapter,
      onInvalid: () => "dark",
    });
    const listener = vi.fn();

    storage.watch("theme", listener);
    adapter.emit({ key: "theme", oldValue: undefined, newValue: '"mauve"' });

    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      newValue: await storage.get("theme"),
    });
  });
});

describe("update of a watched key", () => {
  it("does not read what it is replacing a second time", async () => {
    const adapter = recordingAdapter({ theme: '"dark"' });
    const storage = createStorage({ schema, adapter });
    const listener = vi.fn();

    storage.watch("theme", listener);
    await storage.update("theme", () => "light");

    expect(adapter.calls).toEqual(["get theme", "set theme"]);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ oldValue: "dark", newValue: "light" });
  });
});

describe("delivery", () => {
  it("keeps changes in order when a validator answers later for the earlier one", async () => {
    const adapter = feedAdapter();
    const storage = createStorage({
      schema: defineStorageSchema({ text: { schema: slowerWhenLongerSchema } }),
      adapter,
    });
    const seen: Array<unknown> = [];

    storage.watch("text", (change) => {
      seen.push(change.newValue);
    });
    adapter.emit({ key: "text", oldValue: undefined, newValue: '"a long value"' });
    adapter.emit({ key: "text", oldValue: undefined, newValue: '"b"' });

    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });

    expect(seen).toEqual(["a long value", "b"]);
  });

  it("delivers a change a listener makes after the one it is handling", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });
    const seen: Array<string> = [];

    storage.onChange((key) => {
      seen.push(`first:${String(key)}`);

      if (key === "theme") storage.setSync("nickname", "x");
    });
    storage.onChange((key) => {
      seen.push(`second:${String(key)}`);
    });
    storage.setSync("theme", "dark");

    expect(seen).toEqual(["first:theme", "second:theme", "first:nickname", "second:nickname"]);
  });

  it("reports a listener that throws and still calls the others", () => {
    const onError = vi.fn();
    const storage = createStorage({ schema, adapter: memoryAdapter({ name: "mem" }), onError });
    const after = vi.fn();
    const cause = new Error("listener broke");

    storage.watch("theme", () => {
      throw cause;
    });
    storage.watch("theme", after);

    expect(() => {
      storage.setSync("theme", "dark");
    }).not.toThrow();

    expect(after).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: STORAGE_ERROR_CODE.Adapter,
        adapter: "mem",
        operation: STORAGE_OPERATION.Subscribe,
        cause,
      }),
    );
  });

  it("keeps delivering after an onError that throws", () => {
    const storage = createStorage({
      schema,
      adapter: memoryAdapter(),
      onError: () => {
        throw new TypeError("observer broke");
      },
    });
    const listener = vi.fn();
    const stop = storage.watch("theme", () => {
      throw new Error("listener broke");
    });

    storage.setSync("theme", "dark");
    stop();
    storage.watch("theme", listener);
    storage.setSync("theme", "light");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("carries on after a validator throws while decoding", async () => {
    const adapter = feedAdapter();
    const onError = vi.fn();
    const throwing = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => {
          if (value === "boom") throw new Error("validator broke");

          return { value };
        },
      },
    };
    const storage = createStorage({
      schema: defineStorageSchema({ text: { schema: throwing } }),
      adapter,
      onError,
    });
    const listener = vi.fn();

    storage.watch("text", listener);
    adapter.emit({ key: "text", oldValue: undefined, newValue: '"boom"' });
    adapter.emit({ key: "text", oldValue: undefined, newValue: '"fine"' });

    expect(onError).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ newValue: "fine" });
  });

  it("delivers nothing to a watcher that stopped while its change was being read", async () => {
    const adapter = feedAdapter();
    const decoding = gate();
    const validator = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => decoding.opened.then(() => ({ value })),
      },
    };
    const storage = createStorage({
      schema: defineStorageSchema({ text: { schema: validator } }),
      adapter,
    });
    const listener = vi.fn();
    const stop = storage.watch("text", listener);

    adapter.emit({ key: "text", oldValue: undefined, newValue: '"a"' });
    stop();
    decoding.open();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("waits for a slow delivery before starting the next", async () => {
    const adapter = feedAdapter();
    const slow = gate();
    const answers = [slow.opened.then(() => ({ value: "first" })), { value: "second" }];
    const validator = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => answers.shift() ?? { value: undefined },
      },
    };
    const storage = createStorage({
      schema: defineStorageSchema({ text: { schema: validator } }),
      adapter,
    });
    const anyChange = vi.fn();
    const listener = vi.fn();

    storage.watch("text", listener);
    storage.onChange(anyChange);
    adapter.emit({ key: "text", oldValue: undefined, newValue: '"a"' });
    adapter.emit({ key: "text", oldValue: undefined, newValue: '"b"' });

    expect(anyChange).toHaveBeenCalledTimes(1);

    slow.open();

    await vi.waitFor(() => {
      expect(anyChange).toHaveBeenCalledTimes(2);
    });
  });
});

function heldValidator(held: Promise<void>): StandardSchemaV1<string, string> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => held.then(() => ({ value: String(value) })),
    },
  };
}

function heldWrites(reportsOwnWrites = false) {
  const adapter = feedAdapter({}, reportsOwnWrites);
  const landing = gate();

  return {
    adapter,
    landing,
    held: {
      ...adapter,
      set: (key: string, value: string) => landing.opened.then(() => adapter.set(key, value)),
    },
  };
}

async function started(adapter: { readonly calls: Array<string> }): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  expect(adapter.calls).toEqual([]);
}

describe("event order and recipients", () => {
  const counts = defineStorageSchema({
    count: { schema: z.number(), default: 0 },
    other: { schema: z.number(), default: 0 },
  });

  describe("a write made from inside onChange", () => {
    it("is delivered to watchers after the change that caused it, on the same key", () => {
      const storage = createStorage({ schema: counts, adapter: memoryAdapter() });
      const seen: Array<ReadonlyArray<number>> = [];
      let wroteAgain = false;

      storage.watch("count", ({ oldValue, newValue }) => {
        seen.push([oldValue, newValue]);
      });
      storage.onChange(() => {
        if (wroteAgain) return;
        wroteAgain = true;
        storage.setSync("count", 2);
      });
      storage.setSync("count", 1);

      expect(seen).toEqual([
        [0, 1],
        [1, 2],
      ]);
    });

    it("is delivered to watchers after the change that caused it, on another key", () => {
      const storage = createStorage({ schema: counts, adapter: memoryAdapter() });
      const seen: Array<string> = [];

      storage.watch("count", () => {
        seen.push("count");
      });
      storage.watch("other", () => {
        seen.push("other");
      });
      storage.onChange((key) => {
        if (key === "count") storage.setSync("other", 1);
      });
      storage.setSync("count", 1);

      expect(seen).toEqual(["count", "other"]);
    });

    it("waits behind every key a change to no particular key has to report", async () => {
      const adapter = feedAdapter({ count: "1", other: "1" });
      const storage = createStorage({ schema: counts, adapter });
      const seen: Array<string> = [];
      let wrote = false;

      storage.watch("count", (change) => {
        seen.push(`count ${String(change.oldValueKnown)}`);
      });
      storage.watch("other", (change) => {
        seen.push(`other ${String(change.oldValueKnown)}`);
      });
      storage.onChange((key) => {
        if (key !== undefined || wrote) return;
        wrote = true;
        void storage.set("count", 5);
      });
      adapter.emit({ key: undefined });

      await vi.waitFor(() => {
        expect(seen).toHaveLength(3);
      });

      expect(seen).toEqual(["count false", "other false", "count true"]);
    });
  });

  describe("a listener arriving while a change is being delivered", () => {
    it("does not receive a change that arrived before it, and the one that stopped does not either", async () => {
      const adapter = feedAdapter();
      const decoding = gate();
      const storage = createStorage({
        schema: defineStorageSchema({ text: { schema: heldValidator(decoding.opened) } }),
        adapter,
      });
      const first = vi.fn();
      const second = vi.fn();
      const stop = storage.watch("text", first);

      adapter.emit({ key: "text", oldValue: undefined, newValue: '"a"' });
      stop();
      storage.watch("text", second);
      decoding.open();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
    });

    it("hears nothing from onChange about a change already queued", async () => {
      const adapter = feedAdapter();
      const decoding = gate();
      const storage = createStorage({
        schema: defineStorageSchema({ text: { schema: heldValidator(decoding.opened) } }),
        adapter,
      });
      const early = vi.fn();
      const stopped = vi.fn();
      const late = vi.fn();

      storage.watch("text", vi.fn());
      storage.onChange(early);

      const stop = storage.onChange(stopped);

      adapter.emit({ key: "text", oldValue: undefined, newValue: '"a"' });
      adapter.emit({ key: "text", oldValue: undefined, newValue: '"b"' });
      stopped.mockClear();
      early.mockClear();
      stop();
      storage.onChange(late);
      decoding.open();

      await vi.waitFor(() => {
        expect(early).toHaveBeenCalledOnce();
      });

      expect(stopped).not.toHaveBeenCalled();
      expect(late).not.toHaveBeenCalled();
    });

    it("still receives a change that arrives after it", () => {
      const adapter = feedAdapter();
      const storage = createStorage({ schema: counts, adapter });
      const listener = vi.fn();

      storage.watch("count", vi.fn())();
      storage.watch("count", listener);
      adapter.emit({ key: "count", oldValue: "0", newValue: "1" });

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe("a listener arriving while a write is under way", () => {
    it("is told through onChange once the write lands", async () => {
      const { adapter, landing, held } = heldWrites();
      const storage = createStorage({ schema: counts, adapter: held });
      const listener = vi.fn();
      const writing = storage.set("count", 1);

      await started(adapter);
      storage.onChange(listener);
      landing.open();
      await writing;

      expect(adapter.entries.get("count")).toBe("1");
      expect(listener).toHaveBeenCalledExactlyOnceWith("count");
    });

    it("is told through watch, with the replaced value reported as unknown", async () => {
      const { adapter, landing, held } = heldWrites();
      const storage = createStorage({ schema: counts, adapter: held });
      const listener = vi.fn();
      const writing = storage.set("count", 1);

      await started(adapter);
      storage.watch("count", listener);
      landing.open();
      await writing;

      expect(listener).toHaveBeenCalledExactlyOnceWith({
        key: "count",
        oldValue: 0,
        newValue: 1,
        oldValueKnown: false,
      });
    });

    it("leaves the telling to a backend that reports its own writes", async () => {
      const { adapter, landing, held } = heldWrites(true);
      const storage = createStorage({ schema: counts, adapter: held });
      const listener = vi.fn();
      const writing = storage.set("count", 1);

      await started(adapter);
      storage.onChange(listener);
      landing.open();
      await writing;

      expect(listener).not.toHaveBeenCalled();

      adapter.emit({ key: "count", oldValue: undefined, newValue: "1" });

      expect(listener).toHaveBeenCalledOnce();
    });

    it("tells nobody when the last listener left before the write landed", async () => {
      const { adapter, landing, held } = heldWrites();
      const storage = createStorage({ schema: counts, adapter: held });
      const listener = vi.fn();
      const stop = storage.watch("count", listener);
      const writing = storage.set("count", 1);

      await vi.waitFor(() => {
        expect(adapter.calls).toEqual(["get count"]);
      });
      stop();
      landing.open();
      await writing;

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not read what is being replaced where the backend will report it", async () => {
      const adapter = feedAdapter({}, true);
      const storage = createStorage({ schema: counts, adapter });

      storage.watch("count", vi.fn());
      await storage.set("count", 1);

      expect(adapter.calls).toEqual(["set count"]);
    });
  });

  describe("what cannot be copied", () => {
    it("reaches each listener as it is, while plain data does not", () => {
      const pattern = /a/g;
      const storage = createStorage({
        schema: defineStorageSchema({
          value: { schema: z.unknown(), default: pattern },
        }),
        adapter: memoryAdapter(),
      });
      const seen: Array<unknown> = [];

      storage.watch("value", (change) => {
        seen.push(change.oldValue);
      });
      storage.setSync("value", "text");

      expect(seen[0]).toBe(pattern);
    });
  });
});

describe("the connection to the backend", () => {
  it("connects during the first call, for a service worker's first turn", () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter });

    expect(adapter.connections()).toBe(0);

    storage.watch("theme", vi.fn());

    expect(adapter.connections()).toBe(1);
  });

  it("shares one connection and stops after the last listener", () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter });
    const stopWatch = storage.watch("theme", vi.fn());
    const stopChange = storage.onChange(vi.fn());

    expect(adapter.connections()).toBe(1);

    stopWatch();
    expect(adapter.connections()).toBe(1);

    stopChange();
    expect(adapter.connections()).toBe(0);
  });

  it("connects again for a listener that arrives later", () => {
    const adapter = feedAdapter();
    const storage = createStorage({ schema, adapter });

    storage.onChange(vi.fn())();
    storage.onChange(vi.fn());

    expect(adapter.connections()).toBe(1);
  });

  it("reports a backend that refuses to connect, and still announces its own writes", () => {
    const onError = vi.fn();
    const adapter: StorageAdapter<string> = {
      ...memoryAdapter({ name: "stubborn" }),
      subscribe: () => {
        throw new Error("no feed");
      },
    };
    const storage = createStorage({ schema, adapter, onError });
    const listener = vi.fn();

    expect(() => storage.onChange(listener)).not.toThrow();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        adapter: "stubborn",
        operation: STORAGE_OPERATION.Subscribe,
      }),
    );
  });

  it("does not report a failure this library already raised", () => {
    const onError = vi.fn();
    const adapter: StorageAdapter<string> = {
      ...recordingAdapter(),
      subscribe: () => {
        throw new StorageUnavailableError({
          adapter: "recording",
          operation: STORAGE_OPERATION.Subscribe,
        });
      },
    };

    createStorage({ schema, adapter, onError }).onChange(vi.fn());

    expect(onError).not.toHaveBeenCalled();
  });
});
