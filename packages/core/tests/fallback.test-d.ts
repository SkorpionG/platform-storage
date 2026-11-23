import { describe, expectTypeOf, it } from "vitest";

import {
  createStorage,
  defineStorageSchema,
  hasFallback,
  jsonSerializer,
  memoryAdapter,
  withFallback,
} from "../src/index";
import type {
  FallbackChoice,
  JsonValue,
  PlatformStorage,
  StorageAdapter,
  SyncPlatformStorage,
  SyncStorageAdapter,
} from "../src/index";
import { themeSchema } from "./fixtures/schemas";
import { areaAdapter, asyncOnlyAdapter } from "./fakes/adapters";

const schema = defineStorageSchema({ theme: { schema: themeSchema, default: "light" } });
type Definition = typeof schema.definition;

describe("createStorage's fallback", () => {
  it("keeps the synchronous half where both halves answer immediately", () => {
    expectTypeOf(
      createStorage({ schema, adapter: memoryAdapter(), fallback: "memory" }),
    ).toEqualTypeOf<SyncPlatformStorage<Definition>>();
    expectTypeOf(
      createStorage({ schema, adapter: memoryAdapter(), fallback: memoryAdapter() }),
    ).toEqualTypeOf<SyncPlatformStorage<Definition>>();
  });

  it("drops it where either half only answers later", () => {
    expectTypeOf(
      createStorage({ schema, adapter: memoryAdapter(), fallback: asyncOnlyAdapter }),
    ).toEqualTypeOf<PlatformStorage<Definition>>();
    expectTypeOf(
      createStorage({ schema, adapter: asyncOnlyAdapter, fallback: "memory" }),
    ).toEqualTypeOf<PlatformStorage<Definition>>();
  });

  it("changes nothing where no fallback is given", () => {
    expectTypeOf(createStorage({ schema, adapter: memoryAdapter() })).toEqualTypeOf<
      SyncPlatformStorage<Definition>
    >();
    expectTypeOf(createStorage({ schema, adapter: asyncOnlyAdapter })).toEqualTypeOf<
      PlatformStorage<Definition>
    >();
  });

  /* Checked in the direction a read depends on: a fallback must answer with what the primary would. Text is itself a JSON value, so the reverse pairing is accepted, which is harmless for memory: it holds whatever the storage gives it. */
  it("takes an adapter written inline, its methods typed from the option", () => {
    expectTypeOf(
      createStorage({
        schema,
        adapter: memoryAdapter(),
        fallback: {
          name: "inline",
          serializer: jsonSerializer,
          get: (key) => Promise.resolve(key.length > 0 ? undefined : undefined),
          set: (key, value) => Promise.resolve(void [key, value]),
          remove: () => Promise.resolve(),
        },
      }),
    ).toEqualTypeOf<PlatformStorage<Definition>>();
  });

  it("refuses a fallback that could answer with what the primary never would", () => {
    // @ts-expect-error An area answers with JSON values, which text storage cannot stand in for.
    createStorage({ schema, adapter: memoryAdapter(), fallback: areaAdapter() });
    // @ts-expect-error Only "memory" is a name a fallback can be given by.
    createStorage({ schema, adapter: memoryAdapter(), fallback: "disk" });
  });
});

describe("withFallback to memory", () => {
  it("answers immediately where the primary does, and only later where it does not", () => {
    expectTypeOf(withFallback(memoryAdapter(), "memory")).toEqualTypeOf<
      SyncStorageAdapter<string> & FallbackChoice
    >();
    expectTypeOf(withFallback(areaAdapter(), "memory")).toEqualTypeOf<
      StorageAdapter<JsonValue> & FallbackChoice
    >();
  });
});

describe("hasFallback", () => {
  it("narrows a storage's adapter so chosen is callable", () => {
    const { adapter } = createStorage({ schema, adapter: memoryAdapter(), fallback: "memory" });

    if (hasFallback(adapter)) {
      expectTypeOf(adapter.chosen()).toEqualTypeOf<"primary" | "fallback" | undefined>();
    }
  });
});
